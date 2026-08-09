'use client';
import React from 'react';

export function Watermark() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center overflow-hidden">
      <img
        src="/image.png"
        alt="Watermark"
        className="w-[40vw] max-w-xl opacity-[0.03] grayscale object-contain select-none mix-blend-luminosity"
      />
    </div>
  );
}
