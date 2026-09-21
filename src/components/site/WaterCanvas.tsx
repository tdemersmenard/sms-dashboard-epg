"use client";

import { useEffect, useRef } from "react";

/** Eau animée du hero — canvas 2D léger, géométrie et couleurs du prototype. */
export default function WaterCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const cx = cv.getContext("2d");
    if (!cx) return;

    let W = 0, H = 0;
    const rs = () => {
      W = cv.width = cv.offsetWidth;
      H = cv.height = cv.offsetHeight;
    };
    rs();
    window.addEventListener("resize", rs);

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let visible = true;
    let last = 0;
    const FRAME_MS = 1000 / 30; // 30 fps suffisent pour de l'eau

    const io = new IntersectionObserver((e) => {
      visible = e[0].isIntersecting;
      if (visible && !reduce) { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); }
    });
    io.observe(cv);

    const draw = (ts: number) => {
      if (!visible) return;
      if (ts - last < FRAME_MS) { raf = requestAnimationFrame(draw); return; }
      last = ts;
      cx.clearRect(0, 0, W, H);
      const t = ts / 1000;
      for (let l = 0; l < 3; l++) {
        cx.beginPath();
        const amp = 10 + l * 8;
        const yb = H * 0.55 + l * H * 0.14;
        const sp = 0.35 + l * 0.12;
        for (let x = 0; x <= W; x += 8) {
          const y = yb + Math.sin(x * 0.008 + t * sp + l * 2) * amp + Math.sin(x * 0.02 - t * sp * 0.7) * amp * 0.4;
          if (x === 0) cx.moveTo(x, y);
          else cx.lineTo(x, y);
        }
        cx.lineTo(W, H);
        cx.lineTo(0, H);
        cx.closePath();
        cx.fillStyle = ["rgba(25,182,217,.05)", "rgba(25,182,217,.07)", "rgba(14,42,71,.5)"][l];
        cx.fill();
      }
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("resize", rs);
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" />;
}
