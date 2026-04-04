"use client";

import { useEffect, useRef } from "react";

interface AgentOrbProps {
  colors: string[];
  size?: number;
  letter?: string;
  className?: string;
  animated?: boolean;
}

export default function AgentOrb({ colors, size = 96, letter, className = "", animated = true }: AgentOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  const c1 = colors[0] || "#667EEA";
  const c2 = colors[1] || "#764BA2";
  const c3 = colors[2] || c2;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = size;
    const h = size;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const cx = w / 2;
    const cy = h / 2;
    const r = w * 0.42;

    function hexToRgb(hex: string) {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result
        ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
        : { r: 102, g: 126, b: 234 };
    }

    const rgb1 = hexToRgb(c1);
    const rgb2 = hexToRgb(c2);
    const rgb3 = hexToRgb(c3);

    let t = Math.random() * Math.PI * 2;

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);

      if (animated) t += 0.008;

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();

      const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      bgGrad.addColorStop(0, `rgba(${rgb1.r},${rgb1.g},${rgb1.b},0.6)`);
      bgGrad.addColorStop(0.5, `rgba(${rgb2.r},${rgb2.g},${rgb2.b},0.5)`);
      bgGrad.addColorStop(1, `rgba(${rgb3.r},${rgb3.g},${rgb3.b},0.8)`);
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      const blobs = [
        { color: rgb1, phase: 0, orbitR: r * 0.32, blobR: r * 0.55, speed: 1 },
        { color: rgb2, phase: Math.PI * 0.7, orbitR: r * 0.28, blobR: r * 0.5, speed: 1.3 },
        { color: rgb3, phase: Math.PI * 1.4, orbitR: r * 0.35, blobR: r * 0.45, speed: 0.9 },
        { color: { r: 255, g: 255, b: 255 }, phase: Math.PI * 0.3, orbitR: r * 0.15, blobR: r * 0.35, speed: 1.6 },
      ];

      for (const blob of blobs) {
        const angle = t * blob.speed + blob.phase;
        const bx = cx + Math.cos(angle) * blob.orbitR;
        const by = cy + Math.sin(angle * 0.7) * blob.orbitR;

        const grad = ctx.createRadialGradient(bx, by, 0, bx, by, blob.blobR);
        grad.addColorStop(0, `rgba(${blob.color.r},${blob.color.g},${blob.color.b},0.7)`);
        grad.addColorStop(0.5, `rgba(${blob.color.r},${blob.color.g},${blob.color.b},0.2)`);
        grad.addColorStop(1, `rgba(${blob.color.r},${blob.color.g},${blob.color.b},0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }

      const shineX = cx + Math.cos(t * 0.5) * r * 0.15;
      const shineY = cy + Math.sin(t * 0.3) * r * 0.1 - r * 0.15;
      const shine = ctx.createRadialGradient(shineX, shineY, 0, shineX, shineY, r * 0.5);
      shine.addColorStop(0, "rgba(255,255,255,0.45)");
      shine.addColorStop(0.4, "rgba(255,255,255,0.1)");
      shine.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = shine;
      ctx.fillRect(0, 0, w, h);

      ctx.restore();

      // outer glow
      const glow = ctx.createRadialGradient(cx, cy, r * 0.85, cx, cy, r * 1.15);
      glow.addColorStop(0, `rgba(${rgb1.r},${rgb1.g},${rgb1.b},0.15)`);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.15, 0, Math.PI * 2);
      ctx.fill();

      if (animated) {
        animRef.current = requestAnimationFrame(draw);
      }
    }

    draw();

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [c1, c2, c3, size, animated]);

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size }}
        className="absolute inset-0"
      />
      {letter && (
        <span
          className="relative z-10 font-bold text-white drop-shadow-md select-none"
          style={{ fontSize: size * 0.32 }}
        >
          {letter}
        </span>
      )}
    </div>
  );
}
