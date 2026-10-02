import type { ReactNode } from 'react';
import { AuthBoundary } from '@/components/layout/auth-boundary';

export default function Layout({ children }: { children: ReactNode }) {
  return <AuthBoundary portal="student">{children}</AuthBoundary>;
}
