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
      }, 2400);
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
          transition={{ duration: 0.4, ease: 'easeInOut' }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background text-text-primary"
        >
          {/* Subtle grid pattern */}
          <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{
            backgroundImage: 'linear-gradient(var(--brand-primary) 1px, transparent 1px), linear-gradient(90deg, var(--brand-primary) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }} />

          {/* Logo container with theme glow */}
          <motion.div
            className="relative w-36 h-36 flex items-center justify-center"
            initial={{ opacity: 0, scale: 0.85, filter: 'blur(10px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Outer glow ring */}
            <motion.div
              className="absolute inset-[-12px] rounded-full border border-brand-primary/30"
              animate={{ scale: [1, 1.08, 1], opacity: [0.3, 0.7, 0.3] }}
              transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
            />

            {/* Inner pulsing glow */}
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{ background: 'radial-gradient(circle, var(--glow-color) 0%, transparent 70%)' }}
              animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.8, 0.4] }}
              transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
            />

            {/* Scanning line */}
            <motion.div
              className="absolute left-0 right-0 h-[2px] z-10"
              style={{ background: 'linear-gradient(90deg, transparent, var(--brand-primary), transparent)' }}
              initial={{ top: '0%', opacity: 0 }}
              animate={{ top: ['0%', '100%', '0%'], opacity: [0, 0.9, 0] }}
              transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut', delay: 0.3 }}
            />

            {/* Logo */}
            <motion.img
              src="/logo.svg"
              alt="Crime OS Emblem"
              className="w-28 h-28 object-contain relative z-10 drop-shadow-md"
              animate={{ opacity: [1, 0.8, 1] }}
              transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
            />
          </motion.div>

          {/* Title reveal */}
          <motion.div
            className="mt-8 flex gap-[3px] relative z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            {title.split('').map((char, i) => (
              <motion.span
                key={i}
                className="text-text-primary font-heading text-xl tracking-[0.25em] font-bold"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 + i * 0.08, duration: 0.3, ease: 'easeOut' }}
              >
                {char === ' ' ? '\u00A0' : char}
              </motion.span>
            ))}
          </motion.div>

          {/* Subtitle */}
          <motion.p
            className="mt-2 text-xs font-mono font-semibold tracking-wider text-text-secondary uppercase text-center max-w-xs px-4 relative z-10"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2, duration: 0.4 }}
          >
            Cyber Crime Intelligence System
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

