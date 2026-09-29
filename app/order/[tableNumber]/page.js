'use client';

// หน้านี้ต้องเช็คสถานะโต๊ะ/เมนูจาก Supabase ตอนรันจริงเสมอ ห้าม prerender เป็น static ตอน build
export const dynamic = 'force-dynamic';

import { use, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';

const ADULT_PRICE = 289;
const CHILD_PRICE = 145;
const MAX_QTY = 5; // จำนวนสูงสุดต่อเมนู
const MAX_LINES = 10; // จำนวนรายการเมนูสูงสุดต่อการส่ง 1 ครั้ง

export default function OrderPage({ params }) {
  // Next.js เวอร์ชันล่าสุด: params เป็น Promise ต้อง unwrap ด้วย use()
  const { tableNumber } = use(params);
  const table = Number(tableNumber);

  // loading | unavailable | ready | thanks | error
  const [status, setStatus] = useState('loading');
  const [errorMsg, setErrorMsg] = useState('');

  const [session, setSession] = useState(null);
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [activeCat, setActiveCat] = useState(null);

  // cart: { [itemId]: { name, quantity } }
  const [cart, setCart] = useState({});
  const [cartOpen, setCartOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');

  const [billOpen, setBillOpen] = useState(false);
  const [billing, setBilling] = useState(false);

  // ---------- โหลด session + เมนู ----------
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!Number.isInteger(table) || table <= 0) {
        setStatus('unavailable');
        return;
      }
      try {
        const { data: sessionRows, error: sErr } = await supabase
          .from('sessions')
          .select('id, table_number, adult_count, child_count, status')
          .eq('table_number', table)
          .eq('status', 'open')
          .order('created_at', { ascending: false })
          .limit(1);
        if (sErr) throw sErr;
        if (cancelled) return;

        if (!sessionRows || sessionRows.length === 0) {
          setStatus('unavailable');
          return;
        }
        setSession(sessionRows[0]);

        const [catRes, itemRes] = await Promise.all([
          supabase.from('menu_categories').select('id, name, sort_order').order('sort_order', { ascending: true }),
          supabase.from('menu_items').select('id, category_id, name').order('id', { ascending: true }),
        ]);
        if (catRes.error) throw catRes.error;
        if (itemRes.error) throw itemRes.error;
        if (cancelled) return;

        setCategories(catRes.data || []);
        setItems(itemRes.data || []);
        setActiveCat(catRes.data && catRes.data.length > 0 ? catRes.data[0].id : null);
        setStatus('ready');
      } catch (e) {
        if (cancelled) return;
        setErrorMsg(e?.message || 'ไม่ทราบสาเหตุ');
        setStatus('error');
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [table]);

  // ข้อความแจ้งเตือนสั้น ๆ หายเองใน 3 วินาที
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 3000);
    return () => clearTimeout(t);
  }, [notice]);

  // ---------- ตะกร้า ----------
  const lines = Object.entries(cart);
  const lineCount = lines.length;
  const totalQty = lines.reduce((sum, [, v]) => sum + v.quantity, 0);

  function addItem(item) {
    const existing = cart[item.id];
    if (existing) {
      if (existing.quantity >= MAX_QTY) {
        setNotice(`สั่งได้สูงสุด ${MAX_QTY} ที่ต่อเมนู`);
        return;
      }
      setCart({ ...cart, [item.id]: { ...existing, quantity: existing.quantity + 1 } });
      return;
    }
    if (lineCount >= MAX_LINES) {
      setNotice(`ส่งได้สูงสุด ${MAX_LINES} รายการต่อครั้ง กรุณาส่งออเดอร์ก่อนแล้วสั่งเพิ่ม`);
      return;
    }
    setCart({ ...cart, [item.id]: { name: item.name, quantity: 1 } });
  }

  function decreaseItem(itemId) {
    const existing = cart[itemId];
    if (!existing) return;
    if (existing.quantity <= 1) {
      const next = { ...cart };
      delete next[itemId];
      setCart(next);
      if (Object.keys(next).length === 0) setCartOpen(false);
    } else {
      setCart({ ...cart, [itemId]: { ...existing, quantity: existing.quantity - 1 } });
    }
  }

  // ---------- ส่งออเดอร์ ----------
  async function sendOrder() {
    if (sending || lineCount === 0 || !session) return;
    setSending(true);
    try {
      // เช็คซ้ำว่า session ยังเปิดอยู่
      const { data: stillOpen, error: checkErr } = await supabase
        .from('sessions')
        .select('id')
        .eq('id', session.id)
        .eq('status', 'open')
        .limit(1);
      if (checkErr) throw checkErr;
      if (!stillOpen || stillOpen.length === 0) {
        setStatus('unavailable');
        return;
      }

      const orderItems = lines.map(([, v]) => ({ name: v.name, quantity: v.quantity }));
      const { error: insErr } = await supabase.from('orders').insert({
        session_id: session.id,
        table_number: table,
        items: orderItems,
        status: 'received',
      });
      if (insErr) throw insErr;

      setCart({});
      setCartOpen(false);
      setNotice('ส่งออเดอร์แล้ว');
    } catch (e) {
      setNotice('ส่งออเดอร์ไม่สำเร็จ: ' + (e?.message || 'กรุณาลองใหม่'));
    } finally {
      setSending(false);
    }
  }

  // ---------- เรียกเก็บเงิน ----------
  const adultCount = Number(session?.adult_count || 0);
  const childCount = Number(session?.child_count || 0);
  const adultTotal = adultCount * ADULT_PRICE;
  const childTotal = childCount * CHILD_PRICE;
  const grandTotal = adultTotal + childTotal;

  async function confirmBill() {
    if (billing || !session) return;
    setBilling(true);
    try {
      const { error: upErr } = await supabase
        .from('sessions')
        .update({ status: 'closed' })
        .eq('id', session.id)
        .eq('status', 'open')
        .select('id');
      if (upErr) throw upErr;

      setBillOpen(false);
      setCartOpen(false);
      setStatus('thanks');

      // แจ้งเตือนกลุ่ม Telegram ของทีมงาน ไม่ให้ error ตรงนี้กระทบหน้าลูกค้า
      fetch('/api/notify-bill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableNumber: table, adultCount, childCount, total: grandTotal }),
      }).catch(() => {
        /* เงียบไว้ — ไม่ให้กระทบประสบการณ์ลูกค้า ถ้าแจ้งเตือนไม่สำเร็จ */
      });
    } catch (e) {
      setBillOpen(false);
      setNotice('เรียกเก็บเงินไม่สำเร็จ: ' + (e?.message || 'กรุณาลองใหม่'));
    } finally {
      setBilling(false);
    }
  }

  // ---------- หน้าเต็มจอตามสถานะ ----------
  if (status === 'loading') {
    return <FullScreen text="กำลังโหลด..." />;
  }
  if (status === 'unavailable') {
    return <FullScreen text="โต๊ะนี้ยังไม่เปิดใช้งาน กรุณาแจ้งพนักงาน" />;
  }
  if (status === 'thanks') {
    return <FullScreen text="ขอบคุณที่ใช้บริการ" emoji="🙏" />;
  }
  if (status === 'error') {
    return <FullScreen text={`โหลดข้อมูลไม่สำเร็จ: ${errorMsg}`} />;
  }

  // ---------- หน้าสั่งอาหาร ----------
  const visibleItems = items.filter((it) => it.category_id === activeCat);

  return (
    <div style={s.page}>
      <header style={s.header}>
        <div>
          <div style={s.brand}>Amazing cafe</div>
          <div style={s.tableLabel}>โต๊ะ {table}</div>
        </div>
        <button onClick={() => setBillOpen(true)} style={s.billBtn}>
          เรียกเก็บเงิน
        </button>
      </header>

      <nav style={s.tabs}>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveCat(c.id)}
            style={{ ...s.tab, ...(c.id === activeCat ? s.tabActive : {}) }}
          >
            {c.name}
          </button>
        ))}
      </nav>

      <main style={s.list}>
        {visibleItems.length === 0 && <p style={s.empty}>ยังไม่มีเมนูในหมวดนี้</p>}
        {visibleItems.map((it) => {
          const inCart = cart[it.id];
          return (
            <div key={it.id} style={s.itemRow}>
              <span style={s.itemName}>{it.name}</span>
              {inCart ? (
                <div style={s.stepper}>
                  <button onClick={() => decreaseItem(it.id)} style={s.stepBtn} aria-label="ลด">
                    −
                  </button>
                  <span style={s.qty}>{inCart.quantity}</span>
                  <button onClick={() => addItem(it)} style={s.stepBtn} aria-label="เพิ่ม">
                    +
                  </button>
                </div>
              ) : (
                <button onClick={() => addItem(it)} style={s.addBtn} aria-label={`เพิ่ม ${it.name}`}>
                  +
                </button>
              )}
            </div>
          );
        })}
      </main>

      {notice && <div style={s.toast}>{notice}</div>}

      {/* ตะกร้าลอยด้านล่าง */}
      {lineCount > 0 && !cartOpen && (
        <button onClick={() => setCartOpen(true)} style={s.cartBar}>
          <span>🛒 ตะกร้า · {lineCount} รายการ ({totalQty} ที่)</span>
          <span>ดูตะกร้า ›</span>
        </button>
      )}

      {cartOpen && (
        <div style={s.sheetOverlay} onClick={() => setCartOpen(false)}>
          <div style={s.sheet} onClick={(e) => e.stopPropagation()}>
            <div style={s.sheetTitle}>
              ตะกร้า ({lineCount}/{MAX_LINES} รายการ)
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {lines.map(([id, v]) => (
                <div key={id} style={s.itemRow}>
                  <span style={s.itemName}>{v.name}</span>
                  <div style={s.stepper}>
                    <button onClick={() => decreaseItem(id)} style={s.stepBtn} aria-label="ลด">
                      −
                    </button>
                    <span style={s.qty}>{v.quantity}</span>
                    <button onClick={() => addItem({ id, name: v.name })} style={s.stepBtn} aria-label="เพิ่ม">
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={sendOrder} disabled={sending} style={{ ...s.sendBtn, opacity: sending ? 0.6 : 1 }}>
              {sending ? 'กำลังส่ง...' : 'ส่งออเดอร์'}
            </button>
            <button onClick={() => setCartOpen(false)} style={s.closeSheetBtn}>
              สั่งเมนูเพิ่ม
            </button>
          </div>
        </div>
      )}

      {billOpen && (
        <div style={s.modalOverlay}>
          <div style={s.modal} role="dialog" aria-modal="true">
            <h2 style={{ fontSize: 26, margin: '0 0 12px' }}>ยืนยันเรียกเก็บเงิน</h2>
            <p style={s.billLine}>
              ผู้ใหญ่ {adultCount} × {ADULT_PRICE} = {adultTotal.toLocaleString()} บาท
            </p>
            <p style={s.billLine}>
              เด็ก {childCount} × {CHILD_PRICE} = {childTotal.toLocaleString()} บาท
            </p>
            <p style={s.billTotal}>รวม {grandTotal.toLocaleString()} บาท</p>
            <p style={{ fontSize: 16, color: '#7a6a55', margin: '4px 0 0' }}>
              เมื่อยืนยันแล้วจะสั่งอาหารเพิ่มไม่ได้
            </p>
            <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
              <button onClick={() => setBillOpen(false)} disabled={billing} style={s.cancelBtn}>
                ยกเลิก
              </button>
              <button onClick={confirmBill} disabled={billing} style={{ ...s.confirmBtn, opacity: billing ? 0.6 : 1 }}>
                {billing ? 'กำลังดำเนินการ...' : 'ยืนยัน'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FullScreen({ text, emoji }) {
  return (
    <div style={s.full}>
      {emoji && <div style={{ fontSize: 64, marginBottom: 12 }}>{emoji}</div>}
      <p style={{ fontSize: 28, fontWeight: 700, margin: 0, lineHeight: 1.4 }}>{text}</p>
    </div>
  );
}

const s = {
  page: { minHeight: '100vh', background: '#fbf6ec', color: '#3b2f22', fontFamily: 'sans-serif', paddingBottom: 110 },
  header: { position: 'sticky', top: 0, zIndex: 20, background: '#3b2f22', color: '#fbf6ec', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  brand: { fontSize: 20, fontWeight: 700 },
  tableLabel: { fontSize: 16, opacity: 0.85 },
  billBtn: { fontSize: 16, fontWeight: 700, padding: '10px 14px', background: '#f5c26b', color: '#3b2f22', border: 'none', borderRadius: 10, cursor: 'pointer' },
  tabs: { position: 'sticky', top: 62, zIndex: 15, display: 'flex', gap: 8, overflowX: 'auto', padding: '10px 12px', background: '#fbf6ec', borderBottom: '1px solid #e6dcc6' },
  tab: { flex: '0 0 auto', fontSize: 18, fontWeight: 600, padding: '10px 18px', borderRadius: 999, border: '2px solid #c9b68f', background: '#fff', color: '#3b2f22', cursor: 'pointer' },
  tabActive: { background: '#b4532a', color: '#fff', borderColor: '#b4532a' },
  list: { padding: '8px 16px' },
  empty: { textAlign: 'center', fontSize: 18, color: '#7a6a55', marginTop: 40 },
  itemRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '14px 0', borderBottom: '1px dashed #d9ccb0' },
  itemName: { fontSize: 20, flex: 1 },
  addBtn: { width: 52, height: 52, fontSize: 30, fontWeight: 700, lineHeight: 1, borderRadius: '50%', border: 'none', background: '#b4532a', color: '#fff', cursor: 'pointer' },
  stepper: { display: 'flex', alignItems: 'center', gap: 10 },
  stepBtn: { width: 48, height: 48, fontSize: 26, fontWeight: 700, lineHeight: 1, borderRadius: '50%', border: '2px solid #b4532a', background: '#fff', color: '#b4532a', cursor: 'pointer' },
  qty: { minWidth: 24, textAlign: 'center', fontSize: 22, fontWeight: 700 },
  toast: { position: 'fixed', left: 16, right: 16, bottom: 96, zIndex: 40, background: '#166534', color: '#fff', textAlign: 'center', fontSize: 20, fontWeight: 700, padding: '14px 16px', borderRadius: 12, boxShadow: '0 4px 14px rgba(0,0,0,0.25)' },
  cartBar: { position: 'fixed', left: 12, right: 12, bottom: 16, zIndex: 30, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 20, fontWeight: 700, padding: '18px 20px', background: '#b4532a', color: '#fff', border: 'none', borderRadius: 16, boxShadow: '0 4px 14px rgba(0,0,0,0.3)', cursor: 'pointer' },
  sheetOverlay: { position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end' },
  sheet: { width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', background: '#fbf6ec', borderRadius: '20px 20px 0 0', padding: '18px 16px 20px' },
  sheetTitle: { fontSize: 24, fontWeight: 700, marginBottom: 6 },
  sendBtn: { marginTop: 14, fontSize: 24, fontWeight: 700, padding: '18px', background: '#166534', color: '#fff', border: 'none', borderRadius: 14, cursor: 'pointer' },
  closeSheetBtn: { marginTop: 10, fontSize: 18, fontWeight: 600, padding: '12px', background: 'transparent', color: '#7a6a55', border: 'none', cursor: 'pointer' },
  modalOverlay: { position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modal: { width: '100%', maxWidth: 400, background: '#fff', borderRadius: 16, padding: 24 },
  billLine: { fontSize: 20, margin: '6px 0' },
  billTotal: { fontSize: 30, fontWeight: 800, margin: '14px 0 0', color: '#b4532a' },
  cancelBtn: { flex: 1, fontSize: 20, fontWeight: 700, padding: '14px', background: '#e5e7eb', color: '#111', border: 'none', borderRadius: 10, cursor: 'pointer' },
  confirmBtn: { flex: 1, fontSize: 20, fontWeight: 700, padding: '14px', background: '#b4532a', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer' },
  full: { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24, background: '#fbf6ec', color: '#3b2f22', fontFamily: 'sans-serif' },
};
