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
      }, 2000); // 1.2s draw + hold + fade
      return () => clearTimeout(timer);
    }
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#0f172a]"
        >
          <motion.div
            className="relative w-32 h-32 flex items-center justify-center"
            initial={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          >
            <motion.img
              src="/image.png"
              alt="Crime OS Emblem"
              className="w-full h-full object-contain"
              animate={{ opacity: [1, 0.6, 1], scale: [1, 0.97, 1] }}
              transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut', delay: 0.8 }}
            />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.4 }}
            className="mt-8 text-[#f1f5f9] font-mono text-sm tracking-widest uppercase font-bold"
          >
            Crime OS
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
