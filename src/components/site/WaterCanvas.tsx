"use client";

import { useEffect, useRef } from "react";

/**
 * L'EAU QUI RÉPOND — le hero est une vraie surface d'eau.
 *
 * Simulation de vagues WebGL maison (height field ping-pong, ~256²):
 * le curseur crée des ondulations en glissant, un clic/tap fait une vague,
 * et des gouttes ambiantes gardent la surface vivante au repos.
 * Zéro librairie. Replis: WebGL indisponible → canvas 2D (sinus) ;
 * prefers-reduced-motion → dégradé calme statique.
 */

const SIM = 256;

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// Propagation de l'onde (hauteur + vitesse en RG)
const SIM_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uPrev;
uniform vec2 uTexel;
uniform vec3 uDrop;   // x, y, force (force 0 = pas de goutte)
void main() {
  vec2 hv = texture(uPrev, vUv).rg;
  float l = texture(uPrev, vUv - vec2(uTexel.x, 0.0)).r;
  float r = texture(uPrev, vUv + vec2(uTexel.x, 0.0)).r;
  float b = texture(uPrev, vUv - vec2(0.0, uTexel.y)).r;
  float t = texture(uPrev, vUv + vec2(0.0, uTexel.y)).r;
  float lap = (l + r + b + t) * 0.25 - hv.r;
  float v = hv.g + lap * 1.9;
  v *= 0.982;
  float h = hv.r + v;
  if (uDrop.z != 0.0) {
    float d = distance(vUv, uDrop.xy);
    h += uDrop.z * exp(-d * d * 900.0);
  }
  h *= 0.999;
  outColor = vec4(clamp(h, -2.0, 2.0), v, 0.0, 1.0);
}`;

// Rendu: normales → lumière spéculaire aqua + profondeur
const DRAW_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uHeight;
uniform vec2 uTexel;
uniform float uTime;
void main() {
  float hl = texture(uHeight, vUv - vec2(uTexel.x, 0.0)).r;
  float hr = texture(uHeight, vUv + vec2(uTexel.x, 0.0)).r;
  float hb = texture(uHeight, vUv - vec2(0.0, uTexel.y)).r;
  float ht = texture(uHeight, vUv + vec2(0.0, uTexel.y)).r;
  vec3 n = normalize(vec3((hl - hr) * 3.5, (hb - ht) * 3.5, 0.07));

  // micro-houle ambiante pour que la surface respire au repos
  n.xy += 0.012 * vec2(
    sin(vUv.x * 34.0 + uTime * 0.7) + sin(vUv.x * 13.0 - uTime * 0.4),
    cos(vUv.y * 28.0 - uTime * 0.55)
  );
  n = normalize(n);

  // fond: dégradé de profondeur, légèrement déformé par les vagues
  vec2 ruv = vUv + n.xy * 0.14;
  vec3 deep = vec3(0.016, 0.070, 0.125);   // #041220-ish
  vec3 mid  = vec3(0.047, 0.145, 0.259);   // #0C2542-ish
  vec3 base = mix(mid, deep, smoothstep(0.15, 1.0, ruv.y));

  // halo cyan en haut à droite (cohérent avec le fond du site)
  base += vec3(0.03, 0.10, 0.13) * smoothstep(0.85, 0.2, distance(ruv, vec2(0.78, 0.05)));

  // lumière: reflets aqua sur les pentes des vagues
  vec3 lightDir = normalize(vec3(-0.25, 0.45, 0.85));
  float spec = pow(max(dot(n, lightDir), 0.0), 42.0);
  vec3 aqua = vec3(0.498, 0.890, 0.949);
  vec3 cyan = vec3(0.098, 0.714, 0.851);
  float glint = pow(1.0 - abs(n.z), 1.6);

  vec3 color = base + spec * aqua * 1.15 + glint * cyan * 0.9;
  outColor = vec4(color, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error("[water]", gl.getShaderInfoLog(sh));
    return null;
  }
  return sh;
}

function program(gl: WebGL2RenderingContext, frag: string): WebGLProgram | null {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, frag);
  if (!vs || !fs) return null;
  const pr = gl.createProgram();
  if (!pr) return null;
  gl.attachShader(pr, vs);
  gl.attachShader(pr, fs);
  gl.bindAttribLocation(pr, 0, "aPos");
  gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) {
    console.error("[water]", gl.getProgramInfoLog(pr));
    return null;
  }
  return pr;
}

function initWebGL(cv: HTMLCanvasElement, gl: WebGL2RenderingContext): (() => void) | null {
  if (!gl.getExtension("EXT_color_buffer_float")) return null;
  const simPr = program(gl, SIM_FRAG);
  const drawPr = program(gl, DRAW_FRAG);
  if (!simPr || !drawPr) return null;

  // Quad plein écran
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // Ping-pong hauteur/vitesse
  const mkTex = () => {
    const tx = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tx);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, SIM, SIM, 0, gl.RG, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tx;
  };
  let texA = mkTex();
  let texB = mkTex();
  const fbo = gl.createFramebuffer();

  const uPrev = gl.getUniformLocation(simPr, "uPrev");
  const uSimTexel = gl.getUniformLocation(simPr, "uTexel");
  const uDrop = gl.getUniformLocation(simPr, "uDrop");
  const uHeight = gl.getUniformLocation(drawPr, "uHeight");
  const uDrawTexel = gl.getUniformLocation(drawPr, "uTexel");
  const uTime = gl.getUniformLocation(drawPr, "uTime");

  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const resize = () => {
    cv.width = Math.max(2, Math.floor(cv.offsetWidth * dpr));
    cv.height = Math.max(2, Math.floor(cv.offsetHeight * dpr));
  };
  resize();
  window.addEventListener("resize", resize);

  // File de gouttes (curseur, tap, ambiance)
  const drops: { x: number; y: number; s: number }[] = [];
  const pushDrop = (clientX: number, clientY: number, s: number) => {
    const r = cv.getBoundingClientRect();
    const x = (clientX - r.left) / r.width;
    const y = 1 - (clientY - r.top) / r.height;
    if (x < -0.05 || x > 1.05 || y < -0.05 || y > 1.05) return;
    if (drops.length < 6) drops.push({ x, y, s });
  };

  const host = cv.parentElement || cv;
  let lastMove = 0;
  const onMove = (e: PointerEvent) => {
    const now = performance.now();
    if (now - lastMove < 28) return; // ~35 gouttes/s max
    lastMove = now;
    pushDrop(e.clientX, e.clientY, 0.035);
  };
  const onDown = (e: PointerEvent) => pushDrop(e.clientX, e.clientY, 0.22);
  host.addEventListener("pointermove", onMove, { passive: true });
  host.addEventListener("pointerdown", onDown, { passive: true });

  // Gouttes ambiantes: la surface vit même sans visiteur actif
  const ambient = setInterval(() => {
    if (drops.length < 4) {
      drops.push({ x: 0.1 + Math.random() * 0.8, y: 0.15 + Math.random() * 0.7, s: 0.05 + Math.random() * 0.04 });
    }
  }, 2200);

  let visible = true;
  const io = new IntersectionObserver((en) => {
    visible = en[0].isIntersecting;
    if (visible) { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); }
  });
  io.observe(cv);

  let raf = 0;
  const t0 = performance.now();
  const frame = (ts: number) => {
    if (!visible) return;

    // ── Étape de simulation (dans le FBO) ──
    gl.useProgram(simPr);
    gl.viewport(0, 0, SIM, SIM);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texB, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texA);
    gl.uniform1i(uPrev, 0);
    gl.uniform2f(uSimTexel, 1 / SIM, 1 / SIM);
    const d = drops.shift();
    gl.uniform3f(uDrop, d?.x ?? 0, d?.y ?? 0, d?.s ?? 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    [texA, texB] = [texB, texA];

    // ── Rendu à l'écran ──
    gl.useProgram(drawPr);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, cv.width, cv.height);
    gl.bindTexture(gl.TEXTURE_2D, texA);
    gl.uniform1i(uHeight, 0);
    gl.uniform2f(uDrawTexel, 1 / SIM, 1 / SIM);
    gl.uniform1f(uTime, (ts - t0) / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    clearInterval(ambient);
    io.disconnect();
    window.removeEventListener("resize", resize);
    host.removeEventListener("pointermove", onMove);
    host.removeEventListener("pointerdown", onDown);
  };
}

/** Repli 2D: les vagues sinus du design précédent. */
function init2D(cv: HTMLCanvasElement, animate: boolean): () => void {
  const cx = cv.getContext("2d");
  if (!cx) return () => {};
  let W = 0, H = 0;
  const rs = () => { W = cv.width = cv.offsetWidth; H = cv.height = cv.offsetHeight; };
  rs();
  window.addEventListener("resize", rs);
  let raf = 0;
  const draw = (ts: number) => {
    cx.clearRect(0, 0, W, H);
    const t = ts / 1000;
    for (let l = 0; l < 3; l++) {
      cx.beginPath();
      const amp = 10 + l * 8, yb = H * 0.55 + l * H * 0.14, sp = 0.35 + l * 0.12;
      for (let x = 0; x <= W; x += 8) {
        const y = yb + Math.sin(x * 0.008 + t * sp + l * 2) * amp + Math.sin(x * 0.02 - t * sp * 0.7) * amp * 0.4;
        if (x === 0) cx.moveTo(x, y); else cx.lineTo(x, y);
      }
      cx.lineTo(W, H); cx.lineTo(0, H); cx.closePath();
      cx.fillStyle = ["rgba(25,182,217,.05)", "rgba(25,182,217,.07)", "rgba(14,42,71,.5)"][l];
      cx.fill();
    }
    if (animate) raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);
  return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", rs); };
}

export default function WaterCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return init2D(cv, false); // une frame calme, aucune animation

    const gl = cv.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: "low-power" });
    if (gl) {
      const cleanup = initWebGL(cv, gl as WebGL2RenderingContext);
      if (cleanup) return cleanup;
    }
    return init2D(cv, true);
  }, []);

  return <canvas ref={ref} aria-hidden="true" style={{ touchAction: "pan-y" }} />;
}
