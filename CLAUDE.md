# Amazing cafe — ระบบสั่งอาหารบุฟเฟ่ต์

## Stack
- Next.js (App Router), **JavaScript เท่านั้น (ไม่ใช้ TypeScript)**
- Deploy บน Vercel, backend บน Supabase
- Supabase client: `lib/supabaseClient.js` (อ่านจาก `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)

## กฎสำคัญ: Dynamic Route params
โปรเจกต์นี้ใช้ Next.js เวอร์ชันล่าสุด ซึ่ง `params` ของ Dynamic Route เป็น **Promise**
ต้อง unwrap ด้วย `use()` จาก React เสมอ เช่น

```js
'use client';
import { use } from 'react';

export default function Page({ params }) {
  const { sessionId } = use(params);
  // ...
}
```

## โครงสร้างฐานข้อมูล Supabase (สร้างไว้แล้ว — ไม่ต้องสร้างใหม่)
- `sessions` (id, table_number, adult_count, child_count, status, created_at)
- `menu_categories` (id, name, sort_order)
- `menu_items` (id, category_id, name)
- `orders` (id, session_id, table_number, items jsonb, status, created_at)

## หน้าที่มีตอนนี้
- `/` — ชื่อร้าน + ลิงก์ไป `/generate-qr` และ `/kitchen`
- หน้าสั่งอาหาร (Dynamic Route) — ขั้นตอนถัดไป
