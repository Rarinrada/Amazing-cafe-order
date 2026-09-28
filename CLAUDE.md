# Amazing cafe — Project Notes

ระบบสั่งอาหารร้านบุฟเฟต์ | Next.js (App Router, **JavaScript ไม่ใช่ TypeScript**) | Vercel | Supabase

## Environment variables
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Supabase client: `lib/supabaseClient.js` (`import { supabase } from '@/lib/supabaseClient'` หรือ path สัมพัทธ์)

## ⚠️ Next.js เวอร์ชันล่าสุด: `params` ของ Dynamic Route เป็น Promise
ต้อง unwrap ด้วย `use()` จาก React เสมอ (ใน Client Component):

```js
'use client';
import { use } from 'react';

export default function Page({ params }) {
  const { tableId } = use(params);
  // ...
}
```

## โครงสร้างตารางฐานข้อมูล (มีอยู่แล้วใน Supabase — ไม่ต้องสร้างใหม่)
อ้างอิงตามนี้ทั้งโปรเจกต์:

- `sessions` (id, table_number, adult_count, child_count, status, created_at)
- `menu_categories` (id, name, sort_order)
- `menu_items` (id, category_id, name)
- `orders` (id, session_id, table_number, items **jsonb**, status, created_at)

## หน้าที่มี / วางแผน
- `/` หน้าแรก (ทดสอบ deploy)
- `/generate-qr`, `/kitchen` — ขั้นตอนถัดไป
- หน้าสั่งอาหาร (Dynamic Route) — ขั้นตอนถัดไป
