import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';

export const metadata: Metadata = {
  title: 'Crime OS — Gujarat Police',
  description:
    'Official Crime Management System of Gujarat Police. File complaints, track investigations, and access police services online.',
  keywords: ['Gujarat Police', 'Crime OS', 'FIR', 'Police complaint', 'Gujarat'],
  authors: [{ name: 'Gujarat Police', url: 'https://www.gujaratpolice.gov.in' }],
};

interface RootLayoutProps {
  children: React.ReactNode;
}

/**
 * Root layout — wraps the entire application with AuthProvider.
 */
export default function RootLayout({ children }: RootLayoutProps): React.ReactElement {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-screen font-sans antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
