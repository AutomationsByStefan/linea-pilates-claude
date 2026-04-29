import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Linea Pilates Reformer Trebinje',
  description: 'Upravljanje treninzima i članicama',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sr">
      <body style={{ margin: 0, padding: 0 }} suppressHydrationWarning>{children}</body>
    </html>
  );
}
