'use client';

// จอครัวต้องเป็นข้อมูลสดเสมอ ห้าม prerender เป็น static ตอน build
export const dynamic = 'force-dynamic';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

export default function KitchenPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const busyRef = useRef(new Set()); // กันกดซ้ำระหว่างรอ update

  // ---------- โหลดออเดอร์ครั้งแรก + subscribe realtime ----------
  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      try {
        const { data, error: err } = await supabase
          .from('orders')
          .select('id, session_id, table_number, items, status, created_at')
          .in('status', ['received', 'cooking'])
          .order('created_at', { ascending: true });
        if (err) throw err;
        if (!cancelled) setOrders(data || []);
      } catch (e) {
        if (!cancelled) setError(e?.message || 'โหลดออเดอร์ไม่สำเร็จ');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadInitial();

    const channel = supabase
      .channel('kitchen-orders')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          const row = payload.new;
          if (row.status === 'received' || row.status === 'cooking') {
            setOrders((prev) => {
              if (prev.some((o) => o.id === row.id)) return prev;
              return [...prev, row].sort(
                (a, b) => new Date(a.created_at) - new Date(b.created_at)
              );
            });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        (payload) => {
          const row = payload.new;
          setOrders((prev) => {
            if (row.status === 'served' || row.status === 'cancelled') {
              return prev.filter((o) => o.id !== row.id);
            }
            const exists = prev.some((o) => o.id === row.id);
            if (!exists) {
              return [...prev, row].sort(
                (a, b) => new Date(a.created_at) - new Date(b.created_at)
              );
            }
            return prev.map((o) => (o.id === row.id ? row : o));
          });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  // ---------- อัปเดตสถานะ ----------
  async function updateStatus(orderId, newStatus) {
    if (busyRef.current.has(orderId)) return;
    busyRef.current.add(orderId);

    // อัปเดตหน้าจอทันที (optimistic) เพื่อความไวในครัว
    if (newStatus === 'served') {
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
    } else {
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)));
    }

    try {
      const { error: err } = await supabase.from('orders').update({ status: newStatus }).eq('id', orderId);
      if (err) throw err;
    } catch (e) {
      setError('อัปเดตสถานะไม่สำเร็จ: ' + (e?.message || 'กรุณาลองใหม่'));
      // โหลดข้อมูลใหม่เพื่อให้ตรงกับฐานข้อมูลจริง หากอัปเดตไม่สำเร็จ
      const { data } = await supabase
        .from('orders')
        .select('id, session_id, table_number, items, status, created_at')
        .in('status', ['received', 'cooking'])
        .order('created_at', { ascending: true });
      if (data) setOrders(data);
    } finally {
      busyRef.current.delete(orderId);
    }
  }

  function formatTime(iso) {
    try {
      return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  return (
    <div style={s.page}>
      <header style={s.header}>
        <span>🍳 จอครัว — Amazing cafe</span>
        <span style={s.count}>{orders.length} ออเดอร์</span>
      </header>

      {error && <div style={s.errorBar}>{error}</div>}

      {loading ? (
        <p style={s.loadingText}>กำลังโหลด...</p>
      ) : orders.length === 0 ? (
        <p style={s.emptyText}>ยังไม่มีออเดอร์ที่ต้องทำ</p>
      ) : (
        <div style={s.grid}>
          {orders.map((o) => {
            const isCooking = o.status === 'cooking';
            const items = Array.isArray(o.items) ? o.items : [];
            return (
              <div key={o.id} style={{ ...s.card, ...(isCooking ? s.cardCooking : s.cardReceived) }}>
                <div style={s.cardTop}>
                  <span style={s.tableNum}>โต๊ะ {o.table_number}</span>
                  <span style={s.time}>{formatTime(o.created_at)}</span>
                </div>

                <ul style={s.itemList}>
                  {items.map((it, idx) => (
                    <li key={idx} style={s.itemLine}>
                      <span style={s.itemQty}>×{it.quantity}</span> {it.name}
                    </li>
                  ))}
                </ul>

                <div style={s.cardActions}>
                  {!isCooking && (
                    <button onClick={() => updateStatus(o.id, 'cooking')} style={s.startBtn}>
                      เริ่มทำ
                    </button>
                  )}
                  <button onClick={() => updateStatus(o.id, 'served')} style={s.serveBtn}>
                    จัดเสิร์ฟแล้ว
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const s = {
  page: { minHeight: '100vh', background: '#111827', color: '#f3f4f6', fontFamily: 'sans-serif', padding: '0 0 30px' },
  header: { position: 'sticky', top: 0, zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 28px', background: '#1f2937', fontSize: 28, fontWeight: 800, borderBottom: '3px solid #374151' },
  count: { fontSize: 22, fontWeight: 700, color: '#93c5fd' },
  errorBar: { background: '#7f1d1d', color: '#fecaca', fontSize: 18, fontWeight: 700, padding: '12px 20px', textAlign: 'center' },
  loadingText: { fontSize: 26, textAlign: 'center', marginTop: 60, color: '#9ca3af' },
  emptyText: { fontSize: 30, textAlign: 'center', marginTop: 80, color: '#6b7280', fontWeight: 700 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20, padding: 24 },
  card: { borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 14, border: '4px solid transparent', boxShadow: '0 4px 10px rgba(0,0,0,0.4)' },
  cardReceived: { background: '#1e3a8a', borderColor: '#3b82f6' },
  cardCooking: { background: '#7c2d12', borderColor: '#f97316' },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' },
  tableNum: { fontSize: 40, fontWeight: 900, lineHeight: 1 },
  time: { fontSize: 20, fontWeight: 700, opacity: 0.85 },
  itemList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 },
  itemLine: { fontSize: 24, fontWeight: 600 },
  itemQty: { fontWeight: 900, fontSize: 26 },
  cardActions: { display: 'flex', gap: 10, marginTop: 8 },
  startBtn: { flex: 1, fontSize: 22, fontWeight: 800, padding: '16px 8px', background: '#f97316', color: '#111827', border: 'none', borderRadius: 12, cursor: 'pointer' },
  serveBtn: { flex: 1, fontSize: 22, fontWeight: 800, padding: '16px 8px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 12, cursor: 'pointer' },
};
