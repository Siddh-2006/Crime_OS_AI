'use client';
import React from 'react';

export function Watermark() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center overflow-hidden">
      <img
        src="/logo.svg"
        alt="Gujarat Police Emblem Watermark"
        className="w-[36vw] max-w-lg opacity-[0.08] dark:opacity-[0.12] grayscale object-contain select-none transition-opacity duration-300 pointer-events-none"
      />
    </div>
  );
}
