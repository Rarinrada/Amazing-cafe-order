// API route (รันฝั่งเซิร์ฟเวอร์เท่านั้น) — ส่งข้อความแจ้งเตือนไปกลุ่ม Telegram
// เมื่อลูกค้ากด "เรียกเก็บเงิน" สำเร็จ
// ต้องตั้ง env vars บน Vercel: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
// (ไม่ใช้ prefix NEXT_PUBLIC_ เพราะห้ามให้ browser เห็นค่านี้)

export async function POST(request) {
  try {
    const body = await request.json();
    const { tableNumber, adultCount, childCount, total } = body || {};

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      return Response.json(
        { ok: false, error: 'Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID' },
        { status: 500 }
      );
    }

    const text =
      `💰 เรียกเก็บเงิน — โต๊ะ ${tableNumber}\n` +
      `ผู้ใหญ่ ${adultCount} · เด็ก ${childCount}\n` +
      `ยอดรวม ${Number(total || 0).toLocaleString()} บาท`;

    const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });

    const tgData = await tgRes.json();
    if (!tgRes.ok || !tgData.ok) {
      return Response.json({ ok: false, error: tgData.description || 'Telegram API error' }, { status: 502 });
    }

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || 'Unknown error' }, { status: 500 });
  }
}
