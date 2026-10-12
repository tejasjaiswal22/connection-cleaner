import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Connection Cleaner', description: 'Keep your network relevant. Clean up the noise.' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body>{children}</body></html>);
}
