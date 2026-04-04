"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface AgentOrbProps {
  colors: string[];
  size?: number;
  letter?: string;
  className?: string;
  animated?: boolean;
  interactive?: boolean;
  pulsing?: boolean;
}

function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 102, g: 126, b: 234 };
}

export default function AgentOrb({
  colors,
  size = 96,
  letter,
  className = "",
  animated = true,
  interactive = false,
  pulsing = false,
}: AgentOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const mouseRef = useRef({ x: 0.5, y: 0.5, hover: false });
  const [isHovered, setIsHovered] = useState(false);

  const c1 = colors[0] || "#667EEA";
  const c2 = colors[1] || "#764BA2";
  const c3 = colors[2] || c2;

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const rect = e.currentTarget.getBoundingClientRect();
    mouseRef.current.x = (e.clientX - rect.left) / rect.width;
    mouseRef.current.y = (e.clientY - rect.top) / rect.height;
  }, [interactive]);

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

    const rgb1 = hexToRgb(c1);
    const rgb2 = hexToRgb(c2);
    const rgb3 = hexToRgb(c3);

    let t = Math.random() * Math.PI * 2;
    let pulsePhase = 0;

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);

      const hovered = mouseRef.current.hover;
      const speed = hovered ? 0.018 : 0.008;
      if (animated) t += speed;
      if (pulsing || hovered) pulsePhase += 0.04;

      const pulseScale = (pulsing || hovered) ? 1 + Math.sin(pulsePhase) * 0.04 : 1;
      const effectiveR = r * pulseScale;

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, effectiveR, 0, Math.PI * 2);
      ctx.clip();

      // base gradient
      const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, effectiveR);
      bgGrad.addColorStop(0, `rgba(${rgb1.r},${rgb1.g},${rgb1.b},0.6)`);
      bgGrad.addColorStop(0.5, `rgba(${rgb2.r},${rgb2.g},${rgb2.b},0.5)`);
      bgGrad.addColorStop(1, `rgba(${rgb3.r},${rgb3.g},${rgb3.b},0.8)`);
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // mouse influence
      const mx = interactive ? mouseRef.current.x : 0.5;
      const my = interactive ? mouseRef.current.y : 0.5;
      const mouseOffsetX = (mx - 0.5) * effectiveR * 0.4;
      const mouseOffsetY = (my - 0.5) * effectiveR * 0.4;

      const blobs = [
        { color: rgb1, phase: 0, orbitR: effectiveR * 0.32, blobR: effectiveR * 0.6, speed: 1 },
        { color: rgb2, phase: Math.PI * 0.7, orbitR: effectiveR * 0.28, blobR: effectiveR * 0.55, speed: 1.3 },
        { color: rgb3, phase: Math.PI * 1.4, orbitR: effectiveR * 0.35, blobR: effectiveR * 0.5, speed: 0.9 },
        { color: { r: 255, g: 255, b: 255 }, phase: Math.PI * 0.3, orbitR: effectiveR * 0.18, blobR: effectiveR * 0.4, speed: 1.6 },
      ];

      for (const blob of blobs) {
        const angle = t * blob.speed + blob.phase;
        const bx = cx + Math.cos(angle) * blob.orbitR + mouseOffsetX * 0.3;
        const by = cy + Math.sin(angle * 0.7) * blob.orbitR + mouseOffsetY * 0.3;
        const alpha = hovered ? 0.85 : 0.7;

        const grad = ctx.createRadialGradient(bx, by, 0, bx, by, blob.blobR);
        grad.addColorStop(0, `rgba(${blob.color.r},${blob.color.g},${blob.color.b},${alpha})`);
        grad.addColorStop(0.5, `rgba(${blob.color.r},${blob.color.g},${blob.color.b},${alpha * 0.3})`);
        grad.addColorStop(1, `rgba(${blob.color.r},${blob.color.g},${blob.color.b},0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }

      // shine
      const shineX = cx + Math.cos(t * 0.5) * effectiveR * 0.15 + mouseOffsetX * 0.5;
      const shineY = cy + Math.sin(t * 0.3) * effectiveR * 0.1 - effectiveR * 0.15 + mouseOffsetY * 0.5;
      const shine = ctx.createRadialGradient(shineX, shineY, 0, shineX, shineY, effectiveR * 0.5);
      shine.addColorStop(0, `rgba(255,255,255,${hovered ? 0.55 : 0.4})`);
      shine.addColorStop(0.4, "rgba(255,255,255,0.1)");
      shine.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = shine;
      ctx.fillRect(0, 0, w, h);

      ctx.restore();

      // outer glow (stronger on hover/pulse)
      const glowAlpha = hovered ? 0.3 : pulsing ? 0.2 : 0.12;
      const glowSize = hovered ? 1.25 : 1.15;
      const glow = ctx.createRadialGradient(cx, cy, effectiveR * 0.85, cx, cy, effectiveR * glowSize);
      glow.addColorStop(0, `rgba(${rgb1.r},${rgb1.g},${rgb1.b},${glowAlpha})`);
      glow.addColorStop(0.5, `rgba(${rgb2.r},${rgb2.g},${rgb2.b},${glowAlpha * 0.5})`);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, effectiveR * glowSize, 0, Math.PI * 2);
      ctx.fill();

      if (animated) {
        animRef.current = requestAnimationFrame(draw);
      }
    }

    draw();
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [c1, c2, c3, size, animated, pulsing, interactive]);

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => { mouseRef.current.hover = true; setIsHovered(true); }}
      onMouseLeave={() => { mouseRef.current.hover = false; mouseRef.current.x = 0.5; mouseRef.current.y = 0.5; setIsHovered(false); }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size, transition: "transform 0.3s ease" }}
        className={`absolute inset-0 ${isHovered && interactive ? "scale-105" : ""}`}
      />
      {letter && (
        <span
          className="relative z-10 font-bold text-white select-none"
          style={{
            fontSize: size * 0.32,
            textShadow: "0 2px 8px rgba(0,0,0,0.3)",
            transition: "transform 0.3s ease",
            transform: isHovered && interactive ? "scale(1.05)" : "scale(1)",
          }}
        >
          {letter}
        </span>
      )}
    </div>
  );
}
