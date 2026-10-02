'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { PageLoading } from '@/components/ui/loading-spinner';

export function AuthBoundary({ portal, children }: { portal: 'student' | 'admin'; children: ReactNode }) {
  const { user, isLoading, mustChangePassword } = useAuth();
  const router = useRouter();
  const allowed = portal === 'student' ? user?.role === 'student' : user?.role === 'admin' || user?.role === 'super_admin';

  useEffect(() => {
    if (isLoading) return;
    if (!user) router.replace(`/login/${portal}`);
    else if (mustChangePassword) router.replace('/change-password');
    else if (!allowed) router.replace(user.role === 'student' ? '/student/dashboard' : '/admin/dashboard');
  }, [isLoading, user, mustChangePassword, allowed, portal, router]);

  if (isLoading || !user || !allowed || mustChangePassword) return <PageLoading />;
  return children;
}
