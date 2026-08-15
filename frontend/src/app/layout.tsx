import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { TranslationProvider } from '@/context/TranslationContext';
import { ThemeProvider } from '@/components/ThemeProvider';
import { AppLoader } from '@/components/AppLoader';
import { SyncInitializer } from '@/components/SyncInitializer';

export const metadata: Metadata = {
  title: 'Crime OS — Gujarat Police',
  description:
    'Official Crime Management System of Gujarat Police. File complaints, track investigations, and access police services online.',
  keywords: ['Gujarat Police', 'Crime OS', 'FIR', 'Police complaint', 'Gujarat'],
  authors: [{ name: 'Gujarat Police', url: 'https://www.gujaratpolice.gov.in' }],
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Crime OS',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: '/logo.svg',
    apple: '/image.png',
  },
};

interface RootLayoutProps {
  children: React.ReactNode;
}

/**
 * Root layout — wraps the entire application with AuthProvider & ThemeProvider.
 */
export default function RootLayout({ children }: RootLayoutProps): React.ReactElement {
  return (
    <html lang="en" className="scroll-smooth" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Outfit:wght@300;400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen font-sans antialiased relative">
        <AppLoader />
        <SyncInitializer />
        <AuthProvider>
          <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
            <TranslationProvider>{children}</TranslationProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
