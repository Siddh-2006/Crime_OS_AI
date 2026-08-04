'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { ReactElement } from 'react';

export default function RegisterPage(): ReactElement {
  const router = useRouter();

  useEffect(() => {
    router.replace('/login');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-20 text-center text-neutral-700">
      Redirecting to police login...
    </div>
  );
}
