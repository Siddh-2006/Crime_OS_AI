'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export function AppLoader() {
  const [show, setShow] = useState(true);

  useEffect(() => {
    const hasLoaded = sessionStorage.getItem('app-loaded');
    if (hasLoaded) {
      setShow(false);
    } else {
      const timer = setTimeout(() => {
        sessionStorage.setItem('app-loaded', 'true');
        setShow(false);
      }, 2800);
      return () => clearTimeout(timer);
    }
  }, []);

  const title = 'CRIME OS';

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#080d1a]"
        >
          {/* Background grid */}
          <div className="absolute inset-0 opacity-[0.03]" style={{
            backgroundImage: 'linear-gradient(rgba(56,189,248,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.3) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }} />

          {/* Logo container with glow */}
          <motion.div
            className="relative w-36 h-36 flex items-center justify-center"
            initial={{ opacity: 0, scale: 0.8, filter: 'blur(12px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Outer glow ring */}
            <motion.div
              className="absolute inset-[-12px] rounded-full border border-sky-500/20"
              animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.6, 0.3] }}
              transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
            />

            {/* Inner pulsing glow */}
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(56,189,248,0.12) 0%, transparent 70%)' }}
              animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }}
              transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
            />

            {/* Scanning line */}
            <motion.div
              className="absolute left-0 right-0 h-[2px] z-10"
              style={{ background: 'linear-gradient(90deg, transparent, #38bdf8, transparent)' }}
              initial={{ top: '0%', opacity: 0 }}
              animate={{ top: ['0%', '100%', '0%'], opacity: [0, 0.8, 0] }}
              transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut', delay: 0.5 }}
            />

            {/* Logo */}
            <motion.img
              src="/logo.svg"
              alt="Crime OS Emblem"
              className="w-28 h-28 object-contain relative z-10 drop-shadow-[0_0_20px_rgba(56,189,248,0.3)]"
              animate={{ opacity: [1, 0.7, 1] }}
              transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut', delay: 0.8 }}
            />
          </motion.div>

          {/* Title — letter by letter reveal */}
          <motion.div
            className="mt-10 flex gap-[3px] relative"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            {title.split('').map((char, i) => (
              <motion.span
                key={i}
                className="text-[#f1f5f9] font-heading text-xl tracking-[0.25em] font-bold"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 + i * 0.08, duration: 0.3, ease: 'easeOut' }}
              >
                {char === ' ' ? '\u00A0' : char}
              </motion.span>
            ))}
          </motion.div>

          {/* Subtitle */}
          <motion.p
            className="mt-3 text-[10px] tracking-[0.3em] uppercase font-semibold text-sky-400/60"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.6, duration: 0.4 }}
          >
            Gujarat Police Intelligence Portal
          </motion.p>

          {/* Loading bar */}
          <motion.div
            className="mt-8 w-48 h-[2px] bg-neutral-800 rounded-full overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.8 }}
          >
            <motion.div
              className="h-full bg-gradient-to-r from-sky-500 to-sky-300 rounded-full"
              initial={{ width: '0%' }}
              animate={{ width: '100%' }}
              transition={{ delay: 1.9, duration: 0.8, ease: 'easeInOut' }}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
