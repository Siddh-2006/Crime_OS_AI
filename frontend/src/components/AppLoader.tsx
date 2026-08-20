'use client';

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

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
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: 'easeInOut' }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-background"
        >
          <iframe
            src="/gujarat-police-loader"
            title="Gujarat Police loader"
            className="h-full w-full border-0"
            aria-hidden="true"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

