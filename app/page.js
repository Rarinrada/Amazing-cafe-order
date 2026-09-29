import Link from 'next/link';

export default function Home() {
  return (
    <main style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h1>Amazing cafe</h1>
      <p>ระบบสั่งอาหาร — หน้าทดสอบการ deploy</p>
      <ul>
        <li>
          <Link href="/generate-qr">/generate-qr</Link>
        </li>
        <li>
          <Link href="/kitchen">/kitchen</Link>
        </li>
      </ul>
    </main>
  );
}

