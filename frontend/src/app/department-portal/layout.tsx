import React from 'react';
import { Watermark } from '@/components/Watermark';

export default function DepartmentPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Watermark />
      {children}
    </>
  );
}
