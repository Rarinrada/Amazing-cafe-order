export const metadata = {
  title: 'Amazing cafe',
  description: 'ระบบสั่งอาหารร้าน Amazing cafe',
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
