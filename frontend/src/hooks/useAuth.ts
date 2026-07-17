'use client';

import { useContext } from 'react';
import { AuthContext } from '@/context/AuthContext';

/**
 * Typed hook to consume AuthContext.
 * Throws if used outside AuthProvider — fail fast.
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
