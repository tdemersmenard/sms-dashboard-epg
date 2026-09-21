"use client";

import { useEffect, useRef } from "react";

/** Eau animée du hero — canvas 2D léger (3 couches de sinus), aucune librairie. */
export default function WaterCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let t = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
    };
    resize();
    window.addEventListener("resize", resize);

    const layers = [
      { color: "rgba(14, 42, 71, 0.85)", amp: 22, speed: 0.012, freq: 0.0035, base: 0.72 },
      { color: "rgba(25, 182, 217, 0.10)", amp: 30, speed: 0.018, freq: 0.0028, base: 0.78 },
      { color: "rgba(127, 227, 242, 0.07)", amp: 18, speed: 0.026, freq: 0.0045, base: 0.84 },
    ];

    const draw = () => {
      const { width: w, height: h } = canvas;
      ctx.clearRect(0, 0, w, h);
      for (const l of layers) {
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 8 * dpr) {
          const y =
            h * l.base +
            Math.sin(x * l.freq / dpr + t * l.speed * 60) * l.amp * dpr +
            Math.sin(x * l.freq * 2.3 / dpr - t * l.speed * 40) * l.amp * 0.4 * dpr;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fillStyle = l.color;
        ctx.fill();
      }
      t += 1 / 60;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" />;
}
