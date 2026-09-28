import Link from 'next/link';

export default function HomePage() {
  return (
    <main style={{ maxWidth: 480, margin: '0 auto', padding: '48px 20px', textAlign: 'center' }}>
      <h1>Amazing cafe</h1>
      <p>ระบบสั่งอาหารร้านบุฟเฟต์</p>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 32 }}>
        <Link href="/generate-qr">สร้าง QR (/generate-qr)</Link>
        <Link href="/kitchen">ครัว (/kitchen)</Link>
      </nav>
    </main>
  );
}
