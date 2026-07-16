'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { APP_ROUTES, ROLE } from '@/lib/constants';
import { Loader } from '@/components/ui/Loader';

/**
 * Home page — redirects to appropriate dashboard based on role.
 */
export default function HomePage(): React.ReactElement {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      router.replace(APP_ROUTES.LOGIN);
      return;
    }

    if (user.role === ROLE.SHO || user.role === ROLE.IO) {
      router.replace(APP_ROUTES.POLICE_DASHBOARD);
    } else {
      router.replace(APP_ROUTES.DASHBOARD);
    }
  }, [user, isLoading, router]);

  return <Loader fullPage label="Redirecting..." />;
}
