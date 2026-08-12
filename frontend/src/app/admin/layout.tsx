import React from 'react';
import { Watermark } from '@/components/Watermark';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Watermark />
      {children}
    </>
  );
}
