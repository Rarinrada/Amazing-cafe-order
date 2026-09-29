'use client';

// หน้านี้ต้องเรียก Supabase ตอนรันจริงเสมอ ห้าม prerender เป็น static ตอน build
// (ถ้าไม่มีบรรทัดนี้ Next.js จะพยายาม build หน้านี้ล่วงหน้าและ error ถ้ายังไม่มี env vars ตอน build)
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

export default function GenerateQrPage() {
  const [tableNumber, setTableNumber] = useState('');
  const [adultCount, setAdultCount] = useState('');
  const [childCount, setChildCount] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // session เก่าที่ยังเปิดค้างอยู่ (ถ้ามี)
  const [existing, setExisting] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmNow, setConfirmNow] = useState(0);
  const [closing, setClosing] = useState(false);

  // ผลลัพธ์หลังสร้าง session ใหม่สำเร็จ
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  function resetAll() {
    setTableNumber('');
    setAdultCount('');
    setChildCount('');
    setError('');
    setExisting(null);
    setConfirmOpen(false);
    setResult(null);
    setCopied(false);
  }

  async function handleOpenTable() {
    setError('');
    const table = Number(tableNumber);
    const adults = Number(adultCount || 0);
    const children = Number(childCount || 0);

    if (!Number.isInteger(table) || table <= 0) {
      setError('กรุณากรอกเลขโต๊ะเป็นตัวเลขที่ถูกต้อง');
      return;
    }
    if (!Number.isInteger(adults) || adults < 0 || !Number.isInteger(children) || children < 0) {
      setError('จำนวนผู้ใหญ่/เด็ก ต้องเป็นตัวเลข 0 ขึ้นไป');
      return;
    }
    if (adults + children === 0) {
      setError('กรุณากรอกจำนวนลูกค้าอย่างน้อย 1 คน');
      return;
    }

    setLoading(true);
    try {
      // 1) เช็คว่ามี session เปิดค้างของโต๊ะนี้อยู่หรือไม่
      const { data: openRows, error: checkError } = await supabase
        .from('sessions')
        .select('id, table_number, adult_count, child_count, created_at')
        .eq('table_number', table)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(1);

      if (checkError) throw checkError;

      if (openRows && openRows.length > 0) {
        setExisting(openRows[0]);
        return;
      }

      // 2) ไม่มี -> สร้าง session ใหม่
      const { data: created, error: insertError } = await supabase
        .from('sessions')
        .insert({
          table_number: table,
          adult_count: adults,
          child_count: children,
          status: 'open',
        })
        .select('id, table_number, adult_count, child_count')
        .single();

      if (insertError) throw insertError;

      const url = `${window.location.origin}/order/${created.table_number}`;
      setResult({ ...created, url });
      setCopied(false);
    } catch (e) {
      setError('เกิดข้อผิดพลาด: ' + (e?.message || 'ไม่ทราบสาเหตุ'));
    } finally {
      setLoading(false);
    }
  }

  function openConfirm() {
    setConfirmNow(Date.now());
    setConfirmOpen(true);
  }

  async function handleConfirmClose() {
    if (!existing) return;
    setClosing(true);
    setError('');
    try {
      // อัปเดตเฉพาะแถวนี้ และเฉพาะที่ยังเป็น 'open' (กันกดซ้ำซ้อน)
      const { error: updateError } = await supabase
        .from('sessions')
        .update({ status: 'closed' })
        .eq('id', existing.id)
        .eq('status', 'open')
        .select('id');

      if (updateError) throw updateError;

      // ปิดกล่องยืนยัน + เอากล่องเตือนออก กลับไปที่ฟอร์ม (ค่าที่กรอกยังอยู่)
      setConfirmOpen(false);
      setExisting(null);
    } catch (e) {
      setError('ปิดโต๊ะเดิมไม่สำเร็จ: ' + (e?.message || 'ไม่ทราบสาเหตุ'));
      setConfirmOpen(false);
    } finally {
      setClosing(false);
    }
  }

  async function handleCopy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('คัดลอกไม่สำเร็จ กรุณาคัดลอกลิงก์ด้วยตัวเอง');
    }
  }

  const minutesOpen = existing
    ? Math.max(0, Math.floor((confirmNow - new Date(existing.created_at).getTime()) / 60000))
    : 0;

  // ---------- หน้าผลลัพธ์ QR ----------
  if (result) {
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(result.url)}`;
    return (
      <main style={s.main}>
        <h1 style={s.h1}>เปิดโต๊ะสำเร็จ</h1>
        <div style={{ ...s.card, textAlign: 'center' }}>
          <img src={qrSrc} alt={`QR โต๊ะ ${result.table_number}`} width={300} height={300} style={{ maxWidth: '100%', height: 'auto' }} />
          <p style={s.summary}>
            โต๊ะ {result.table_number} · ผู้ใหญ่ {result.adult_count} · เด็ก {result.child_count}
          </p>
          <div style={s.linkRow}>
            <span style={s.linkText}>{result.url}</span>
            <button onClick={handleCopy} style={s.smallBtn}>
              {copied ? 'คัดลอกแล้ว ✓' : 'คัดลอกลิงก์'}
            </button>
          </div>
          {error && <p style={s.errorText}>{error}</p>}
          <button onClick={resetAll} style={{ ...s.primaryBtn, marginTop: 20 }}>
            เปิดโต๊ะใหม่
          </button>
        </div>
      </main>
    );
  }

  // ---------- หน้าฟอร์ม ----------
  return (
    <main style={s.main}>
      <h1 style={s.h1}>เปิดโต๊ะ</h1>

      {existing && (
        <div style={s.warnBox} role="alert">
          <p style={s.warnText}>โต๊ะนี้มีลูกค้าอยู่ระหว่างทานอาหาร กรุณาปิดออเดอร์เดิมก่อน</p>
          <button onClick={openConfirm} style={s.warnBtn}>
            ปิดออเดอร์เดิม
          </button>
        </div>
      )}

      <div style={s.card}>
        <label style={s.label}>
          เลขโต๊ะ
          <input
            type="number"
            inputMode="numeric"
            min="1"
            value={tableNumber}
            onChange={(e) => {
              setTableNumber(e.target.value);
              setExisting(null); // เปลี่ยนโต๊ะ -> กล่องเตือนของโต๊ะเดิมไม่เกี่ยวแล้ว
            }}
            style={s.input}
          />
        </label>
        <label style={s.label}>
          จำนวนผู้ใหญ่
          <input
            type="number"
            inputMode="numeric"
            min="0"
            value={adultCount}
            onChange={(e) => setAdultCount(e.target.value)}
            style={s.input}
          />
        </label>
        <label style={s.label}>
          จำนวนเด็ก
          <input
            type="number"
            inputMode="numeric"
            min="0"
            value={childCount}
            onChange={(e) => setChildCount(e.target.value)}
            style={s.input}
          />
        </label>

        {error && <p style={s.errorText}>{error}</p>}

        <button onClick={handleOpenTable} disabled={loading} style={{ ...s.primaryBtn, opacity: loading ? 0.6 : 1 }}>
          {loading ? 'กำลังตรวจสอบ...' : 'เปิดโต๊ะ'}
        </button>
      </div>

      {confirmOpen && existing && (
        <div style={s.overlay}>
          <div style={s.dialog} role="dialog" aria-modal="true">
            <h2 style={{ fontSize: 26, margin: '0 0 12px', color: '#b91c1c' }}>ยืนยันปิดโต๊ะเดิม</h2>
            <p style={s.dialogLine}>โต๊ะ {existing.table_number}</p>
            <p style={s.dialogLine}>
              ผู้ใหญ่ {existing.adult_count} · เด็ก {existing.child_count}
            </p>
            <p style={s.dialogLine}>เปิดมาแล้ว {minutesOpen} นาที</p>
            <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
              <button onClick={() => setConfirmOpen(false)} disabled={closing} style={s.cancelBtn}>
                ยกเลิก
              </button>
              <button onClick={handleConfirmClose} disabled={closing} style={{ ...s.dangerBtn, opacity: closing ? 0.6 : 1 }}>
                {closing ? 'กำลังปิด...' : 'ยืนยันปิดโต๊ะเดิม'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

const s = {
  main: { maxWidth: 480, margin: '0 auto', padding: 20, fontFamily: 'sans-serif', fontSize: 20 },
  h1: { fontSize: 32, margin: '0 0 16px' },
  card: { background: '#fff', border: '1px solid #ddd', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 },
  label: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 22, fontWeight: 600 },
  input: { fontSize: 28, padding: '12px 14px', border: '2px solid #999', borderRadius: 8 },
  primaryBtn: { fontSize: 26, fontWeight: 700, padding: '16px', background: '#166534', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer' },
  errorText: { color: '#b91c1c', fontSize: 20, margin: 0 },
  warnBox: { background: '#fff7ed', border: '3px solid #ea580c', borderRadius: 12, padding: 18, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 12 },
  warnText: { margin: 0, fontSize: 24, fontWeight: 700, color: '#9a3412' },
  warnBtn: { fontSize: 24, fontWeight: 700, padding: '14px', background: '#ea580c', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50 },
  dialog: { background: '#fff', border: '4px solid #dc2626', borderRadius: 14, padding: 24, width: '100%', maxWidth: 420 },
  dialogLine: { fontSize: 24, margin: '6px 0' },
  cancelBtn: { flex: 1, fontSize: 22, fontWeight: 700, padding: '14px', background: '#e5e7eb', color: '#111', border: 'none', borderRadius: 10, cursor: 'pointer' },
  dangerBtn: { flex: 1, fontSize: 22, fontWeight: 700, padding: '14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer' },
  summary: { fontSize: 28, fontWeight: 700, margin: '8px 0 0' },
  linkRow: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center' },
  linkText: { fontSize: 18, wordBreak: 'break-all' },
  smallBtn: { fontSize: 16, padding: '8px 12px', background: '#e5e7eb', border: '1px solid #999', borderRadius: 8, cursor: 'pointer' },
};
