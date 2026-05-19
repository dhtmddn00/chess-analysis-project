import { ReactNode } from 'react';

// Root layout required by Next.js; actual layout lives in [locale]/layout.tsx
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
