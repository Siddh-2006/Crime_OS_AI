'use client';

import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="w-9 h-9" />; // Placeholder to avoid layout shift
  }

  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="relative p-2 rounded-xl text-text-secondary hover:text-brand-primary hover:bg-surface-elevated transition-all duration-300 group"
      aria-label="Toggle theme"
    >
      <div className="relative w-5 h-5 overflow-hidden">
        {theme === 'dark' ? (
          <Sun
            size={20}
            className="transition-transform duration-500 group-hover:rotate-90"
          />
        ) : (
          <Moon
            size={20}
            className="transition-transform duration-500 group-hover:-rotate-12"
          />
        )}
      </div>
    </button>
  );
}
