'use client';

import React, { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';

interface Particle {
  x: number;
  y: number;
  radius: number;
  vx: number;
  vy: number;
  alpha: number;
  color: string;
}

export function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);

    const getColors = () => {
      const isDark = document.documentElement.classList.contains('dark') || resolvedTheme === 'dark';
      if (isDark) {
        // Dark Theme: Fire Orange & Amber
        return [
          'rgba(255, 107, 0, ',   // Fire Orange
          'rgba(249, 115, 22, ',  // Amber Orange
          'rgba(255, 170, 0, ',   // Golden Orange
          'rgba(251, 146, 60, ',  // Light Amber
        ];
      }
      // Light Theme: Electric Cyan & Police Navy Blue
      return [
        'rgba(0, 136, 255, ',   // Bright Electric Blue
        'rgba(30, 58, 138, ',   // Police Navy Blue
        'rgba(37, 99, 235, ',   // Royal Blue
        'rgba(2, 132, 199, ',   // Sky Cyan
      ];
    };

    let colors = getColors();

    // Create 65 roaming floating particles
    const particleCount = Math.min(Math.floor((width * height) / 14000), 70);
    const particles: Particle[] = [];

    const initParticles = () => {
      particles.length = 0;
      colors = getColors();
      for (let i = 0; i < particleCount; i++) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          radius: Math.random() * 4.5 + 2,
          vx: (Math.random() - 0.5) * 0.75,
          vy: (Math.random() - 0.5) * 0.75,
          alpha: Math.random() * 0.45 + 0.35,
          color: colors[Math.floor(Math.random() * colors.length)],
        });
      }
    };

    initParticles();

    // Observe theme toggle class changes on <html>
    const observer = new MutationObserver(() => {
      colors = getColors();
      particles.forEach((p) => {
        p.color = colors[Math.floor(Math.random() * colors.length)];
      });
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      const activeIsDark = document.documentElement.classList.contains('dark');
      const lineColor = activeIsDark ? '255, 107, 0' : '0, 136, 255';

      particles.forEach((p, idx) => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;

        // Draw particle bubble
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `${p.color}${p.alpha})`;
        ctx.fill();

        // Connect close particles with subtle connecting lines
        for (let j = idx + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 135) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(${lineColor}, ${0.2 * (1 - dist / 135)})`;
            ctx.lineWidth = 0.9;
            ctx.stroke();
          }
        }
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
      cancelAnimationFrame(animationFrameId);
    };
  }, [resolvedTheme]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0 opacity-100 transition-opacity duration-500"
    />
  );
}
