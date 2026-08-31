import { inkFor } from './color';

// Canvas-2D "growing medium", split across two layered canvases for performance and look:
//   • blooms layer — soft branching-mycelium bursts (the background); rendered at reduced
//     resolution and softened with a single GPU CSS blur (no per-stroke shadowBlur).
//   • stamp layer  — the Hundred Pieces vein reveal; full resolution, crisp, unchanged.
// Growth is additive and drawn incrementally onto persistent canvases (never cleared/re-blitted),
// and the animation loop stops entirely once everything has finished growing (~0 CPU at rest).

type Tip = { x: number; y: number; ang: number; len: number; maxLen: number; w0: number; sp: number; col: string; gen: number; delay: number };
type Vein = { x: number; y: number; ang: number; life: number; w: number };

const WHITES = ['#f4f3ee', '#eae6da', '#f2eee6'];
const DARKS = ['#1c1b17', '#262521', '#2f3a26', '#241f1b', '#1f302e', '#33322c'];
const DUR = 4200;                 // frames for the plate to fully colonise (~70s at 60fps)

// --- bloom look (tuned with thib; slider estimates on a 0..1 scale) ---
const BLOOM_BLUR_PX = 0.5;        // CSS blur on the blooms layer   (Blur ~0.15)
const STAMP_BLUR_PX = 0.5;        // CSS blur on the stamp layer to match the blooms' softness (0 = crisp)
const BLOOM_COVER = 0.8;          // density of blooms              (Cover ~0.8)
const BLOOM_SIZE = 0.6;           // bloom reach multiplier         (Size ~0.15)
const BLOOM_THICK = 0.5;          // filament thickness multiplier  (Thick ~0.4)
// Filament extension pace — lower = slower grow-in. Decoupled from the *shape*: wander and branch
// rate are rescaled off this so a bloom's final curliness/density stays constant as the pace changes.
// 0.55 grew a bloom in ~3s; 0.16 stretches it to ~10s to sit closer to the stamp's reveal pace.
const BLOOM_GROW = 0.08;
const _PACE_R = BLOOM_GROW / 0.55;                 // ratio vs the reference (0.55) look
const BLOOM_WANDER = 0.62 * Math.sqrt(_PACE_R);    // ∝ √step  → same path curliness at any pace
const BLOOM_BRANCH = 0.09 * _PACE_R;               // ∝ step   → same branches-per-length at any pace
const BLOOM_STAGGER = 60;                          // frames (~1s) each burst in a cluster waits before starting

const rnd = (a = 1, b = 0) => b + Math.random() * (a - b);
const pick = <T>(a: T[]): T => a[(Math.random() * a.length) | 0];

export class GrowthGround {
  private blooms = document.createElement('canvas');   // low-res, CSS-blurred
  private bc = this.blooms.getContext('2d')!;
  private stamp = document.createElement('canvas');    // full-res, crisp
  private sc = this.stamp.getContext('2d')!;
  private mk = document.createElement('canvas');       // stamp alpha mask
  private mx = this.mk.getContext('2d', { willReadFrequently: true })!;   // CPU-backed so getImageData is reliable
  private W = 0; private H = 0; private dprB = 1; private dprF = 1;
  private age = 0; private g = 0;
  private ink: string;
  private reduced = matchMedia('(prefers-reduced-motion:reduce)').matches;
  private raf = 0; private running = false; private pendingSettle = false;
  // blooms
  private tips: Tip[] = []; private bloomsSpawned = 0;
  // stamp reveal
  private revealRequested = false; private maskReady = false;
  private stampImg?: HTMLImageElement; private maskImg?: Uint8ClampedArray;
  private edgePts: { x: number; y: number }[] = []; private seededTips = 0;
  private veins: Vein[] = [];
  private cxc = 0; private cyc = 0; private nogoR = 0; private stampSize = 0; private maskFailed = false;

  constructor(private el: HTMLElement, opts: { groundHex: string }) {
    this.ink = inkFor(opts.groundHex);
    for (const c of [this.blooms, this.stamp]) c.setAttribute('aria-hidden', 'true');
    this.blooms.style.filter = `blur(${BLOOM_BLUR_PX}px)`;
    if (STAMP_BLUR_PX > 0) this.stamp.style.filter = `blur(${STAMP_BLUR_PX}px)`;
    this.el.appendChild(this.blooms);   // blooms below
    this.el.appendChild(this.stamp);    // stamp on top (crisp)
  }

  start() {
    if (this.running && !this.reduced) return;
    this.size();
    addEventListener('resize', this.onResize);
    addEventListener('click', this.onClick);
    document.addEventListener('visibilitychange', this.onVis);
    if (this.reduced) { this.pendingSettle = true; queueMicrotask(() => this.trySettle()); return; }
    this.kick();
  }
  stop() { this.running = false; cancelAnimationFrame(this.raf); removeEventListener('resize', this.onResize); removeEventListener('click', this.onClick); document.removeEventListener('visibilitychange', this.onVis); }

  enableReveal(stampUrl: string) {
    if (this.revealRequested) return;
    this.revealRequested = true;
    const img = new Image();
    img.onload = () => {
      this.stampImg = img; this.buildMask(); this.maskReady = true;
      if (this.reduced) { if (this.pendingSettle) this.trySettle(); } else this.kick();
    };
    img.src = stampUrl;
  }

  private onVis = () => { if (document.hidden) cancelAnimationFrame(this.raf); else if (!this.reduced) this.kick(); };
  private onResize = () => this.size();

  private size = () => {
    const d = Math.min(devicePixelRatio || 1, 2);
    this.dprF = d; this.dprB = Math.min(d, 1.25);   // blooms rendered lower-res; the blur hides it
    const r = this.el.getBoundingClientRect();
    this.W = Math.max(2, r.width || innerWidth); this.H = Math.max(2, r.height || innerHeight);
    this.resizeLayer(this.blooms, this.bc, this.dprB);
    this.resizeLayer(this.stamp, this.sc, this.dprF);
    this.cxc = this.W / 2; this.cyc = this.H * 0.40;
    if (this.maskReady) this.buildMask();
    if (!this.reduced) this.kick();
  };
  private resizeLayer(cv: HTMLCanvasElement, cx: CanvasRenderingContext2D, dpr: number) {
    const prev = document.createElement('canvas'); prev.width = cv.width || 1; prev.height = cv.height || 1;
    prev.getContext('2d')!.drawImage(cv, 0, 0);
    cv.width = this.W * dpr; cv.height = this.H * dpr;
    cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.lineCap = 'round';
    cx.drawImage(prev, 0, 0, prev.width / dpr, prev.height / dpr);   // preserve grown pixels
  }

  // ---------- stamp mask (unchanged look) ----------
  private buildMask() {
    if (!this.stampImg) return;
    this.mk.width = this.W * this.dprF; this.mk.height = this.H * this.dprF;
    this.mx.setTransform(this.dprF, 0, 0, this.dprF, 0, 0); this.mx.clearRect(0, 0, this.W, this.H);
    const size = Math.min(this.H * 0.44, this.W * 0.80); this.stampSize = size;
    const ox = this.cxc - size / 2, oy = this.cyc - size / 2;
    this.mx.drawImage(this.stampImg, ox, oy, size, size);
    this.nogoR = size * 0.72;
    this.edgePts = [];
    let data: Uint8ClampedArray | undefined;
    try { data = this.mx.getImageData(0, 0, this.W * this.dprF, this.H * this.dprF).data; } catch { data = undefined; }
    if (data) {
      this.maskImg = data;
      const step = Math.max(3, Math.round(3 * this.dprF));
      const A = (px: number, py: number) => {
        px = (px * this.dprF) | 0; py = (py * this.dprF) | 0;
        if (px < 0 || py < 0 || px >= this.W * this.dprF || py >= this.H * this.dprF) return 0;
        return this.maskImg![(py * this.W * this.dprF + px) * 4 + 3];
      };
      for (let y = oy; y < oy + size; y += step / this.dprF)
        for (let x = ox; x < ox + size; x += step / this.dprF) {
          if (A(x, y) > 70) { const dd = step / this.dprF + 1; if (A(x - dd, y) < 70 || A(x + dd, y) < 70 || A(x, y - dd) < 70 || A(x, y + dd) < 70) this.edgePts.push({ x, y }); }
        }
    }
    // If the pixel readback was blocked or came back blank (some Android browsers: canvas
    // anti-fingerprinting or GPU readback), we can't drive the vein reveal — draw the stamp
    // directly so the title still shows everywhere.
    if (!data || this.edgePts.length === 0) {
      this.maskFailed = true; this.maskImg = undefined; this.edgePts = [];
      this.drawStampFallback(ox, oy, size);
    } else {
      this.maskFailed = false;
    }
  }
  private drawStampFallback(ox: number, oy: number, size: number) {
    if (!this.stampImg) return;
    const s = 512, t = document.createElement('canvas'); t.width = t.height = s;
    const tx = t.getContext('2d')!;
    tx.drawImage(this.stampImg, 0, 0, s, s);
    tx.globalCompositeOperation = 'source-in'; tx.fillStyle = this.ink; tx.fillRect(0, 0, s, s);   // tint to the ink colour
    this.sc.clearRect(ox, oy, size, size);
    this.sc.globalAlpha = 0.9; this.sc.drawImage(t, ox, oy, size, size); this.sc.globalAlpha = 1;
  }
  private inMask(x: number, y: number) {
    if (!this.maskImg) return false;
    const px = (x * this.dprF) | 0, py = (y * this.dprF) | 0;
    if (px < 0 || py < 0 || px >= this.W * this.dprF || py >= this.H * this.dprF) return false;
    return this.maskImg[(py * this.W * this.dprF + px) * 4 + 3] > 70;
  }
  private inNoGo(x: number, y: number) {
    if (!this.maskReady) return false;
    const dx = x - this.cxc, dy = y - this.cyc;
    return dx * dx + dy * dy < this.nogoR * this.nogoR;
  }

  // ---------- blooms: tight cluster of bursts, dense soft core -> branching filaments ----------
  private bloomTarget() { return Math.round(this.W * this.H / 62000 * (0.3 + BLOOM_COVER)); }
  private spawnBloom(px?: number, py?: number) {
    let bx = 0, by = 0;
    if (px !== undefined && py !== undefined) { bx = px; by = py; }   // click/tap: honour the exact spot
    else {
      let tries = 0;
      do { bx = rnd(this.W); by = rnd(this.H); tries++; } while (this.inNoGo(bx, by) && tries < 12);
      if (this.inNoGo(bx, by)) return;
    }
    const col = Math.random() < 0.5 ? pick(WHITES) : pick(DARKS);
    const base = Math.min(this.W, this.H) / 760;
    const size = Math.min(this.W, this.H) * rnd(0.15, 0.07) * BLOOM_SIZE, bursts = 2 + ((Math.random() * 3) | 0), spd = rnd(1.25, 0.7);
    for (let b = 0; b < bursts; b++) {
      const off = size * 0.30, cx = bx + rnd(off, -off), cy = by + rnd(off, -off);
      const bDelay = b * BLOOM_STAGGER + rnd(24, -24);   // cascade bursts ~1s apart (+ jitter)
      const T = Math.round(rnd(26, 16)), rot = rnd(6.2832);
      for (let i = 0; i < T; i++) {
        const ang = rot + (i / T) * 6.2832 + rnd(0.6, -0.6);
        this.tips.push({ x: cx, y: cy, ang, len: 0, maxLen: size * rnd(1.15, 0.5), w0: rnd(2.6, 1.2) * BLOOM_THICK * base, sp: rnd(1.3, 0.7) * spd * BLOOM_GROW * base, col, gen: 0, delay: Math.max(0, bDelay + rnd(12, 0)) });
      }
    }
    this.bloomsSpawned++;
  }
  // Click/tap the background → grow a bloom at that spot. Ignore clicks on interactive UI so
  // links, the form and the tour widget still work normally.
  private onClick = (e: MouseEvent) => {
    const t = e.target as Element | null;
    if (t && t.closest('a, button, input, textarea, select, label, [role="button"], iframe, form')) return;
    this.spawnBloom(e.clientX, e.clientY);
    if (this.reduced) {   // reduced-motion: draw it in without animating
      for (let k = 0; k < 4000 && this.tips.length; k++)
        for (let i = this.tips.length - 1; i >= 0; i--) if (!this.stepBloomTip(this.tips[i])) this.tips.splice(i, 1);
    } else this.kick();
  };

  private stepBloomTip(t: Tip): boolean {
    if (t.delay > 0) { t.delay--; return true; }   // staggered start — wait, stay active
    const prog = t.len / t.maxLen;
    t.ang += rnd(BLOOM_WANDER, -BLOOM_WANDER);
    const sp = t.sp;
    const nx = t.x + Math.cos(t.ang) * sp, ny = t.y + Math.sin(t.ang) * sp;
    const w = Math.max(0.35, t.w0 * (1 - 0.84 * prog));
    this.bc.strokeStyle = t.col; this.bc.globalAlpha = t.gen === 0 ? 0.5 : 0.4; this.bc.lineWidth = w;
    this.bc.beginPath(); this.bc.moveTo(t.x, t.y); this.bc.lineTo(nx, ny); this.bc.stroke();
    t.x = nx; t.y = ny; t.len += sp;
    if (Math.random() < BLOOM_BRANCH && t.gen < 3 && this.tips.length < 6000)
      this.tips.push({ x: t.x, y: t.y, ang: t.ang + rnd(1.1, .5) * (Math.random() < .5 ? 1 : -1), len: 0, maxLen: (t.maxLen - t.len) * rnd(0.7, 0.35), w0: Math.max(0.5, t.w0 * 0.72), sp: t.sp, col: t.col, gen: t.gen + 1, delay: 0 });
    const out = t.x < -30 || t.y < -30 || t.x > this.W + 30 || t.y > this.H + 30;
    return !(t.len >= t.maxLen || out);
  }

  // ---------- stamp veins (unchanged look; drawn onto the crisp stamp layer) ----------
  private seedStamp() {
    const p = pick(this.edgePts);
    this.veins.push({ x: p.x, y: p.y, ang: rnd(6.2832), life: rnd(70, 35), w: rnd(0.85, 0.45) });
  }
  private stepVeins() {
    const sp = this.stampSize * 0.00126;
    const sTarget = Math.round(this.edgePts.length * 1.15 * this.g);
    while (this.seededTips < sTarget) { this.seedStamp(); this.seededTips++; }
    this.sc.lineCap = 'round';
    for (let i = this.veins.length - 1; i >= 0; i--) {
      const t = this.veins[i];
      t.ang += rnd(0.7, -0.7);
      const nx = t.x + Math.cos(t.ang) * sp, ny = t.y + Math.sin(t.ang) * sp;
      if (this.inMask(nx, ny)) {
        this.sc.strokeStyle = this.ink; this.sc.globalAlpha = rnd(0.6, 0.34); this.sc.lineWidth = t.w * rnd(1.3, 0.65);
        this.sc.beginPath(); this.sc.moveTo(t.x, t.y); this.sc.lineTo(nx, ny); this.sc.stroke();
        t.x = nx; t.y = ny;
      } else {
        if (Math.random() < 0.5) { this.sc.strokeStyle = this.ink; this.sc.globalAlpha = rnd(0.34, 0.14); this.sc.lineWidth = t.w * 0.8; this.sc.beginPath(); this.sc.moveTo(t.x, t.y); this.sc.lineTo(nx, ny); this.sc.stroke(); }
        t.ang = rnd(6.2832); t.life -= 3;
      }
      if (--t.life <= 0) this.veins.splice(i, 1);
    }
    this.sc.globalAlpha = 1;
  }

  // ---------- loop with idle-stop ----------
  private grow() {
    this.age += 1; this.g = Math.min(1, this.age / DUR);
    const canBloom = !this.revealRequested || this.maskReady;   // wait for the mask before colonising the centre
    if (canBloom && this.bloomsSpawned < this.bloomTarget() * this.g && Math.random() < 0.05) this.spawnBloom();
    for (let i = this.tips.length - 1; i >= 0; i--) if (!this.stepBloomTip(this.tips[i])) this.tips.splice(i, 1);
    if (this.maskReady) this.stepVeins();
  }
  private settled(): boolean {
    if (this.g < 1) return false;
    if (this.revealRequested && !this.maskReady) return false;
    if (this.tips.length || this.veins.length) return false;
    if (this.bloomsSpawned < this.bloomTarget()) return false;
    if (this.maskReady && this.seededTips < Math.round(this.edgePts.length * 1.15)) return false;
    return true;
  }
  private loop = () => {
    this.grow();
    if (this.settled()) { this.running = false; return; }   // stop the rAF loop — ~0 CPU at rest
    this.raf = requestAnimationFrame(this.loop);
  };
  private kick() {
    if (this.reduced || this.running || this.settled()) return;
    this.running = true; cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(this.loop);
  }

  // reduced-motion: fast-forward to a settled plate (no animation), then hold
  private trySettle() {
    if (this.revealRequested && !this.maskReady) return;
    this.pendingSettle = false; this.g = 1; this.age = DUR;
    for (let k = 0; k < 24000 && !this.settled(); k++) {
      if (this.bloomsSpawned < this.bloomTarget() && Math.random() < 0.5) this.spawnBloom();
      for (let i = this.tips.length - 1; i >= 0; i--) if (!this.stepBloomTip(this.tips[i])) this.tips.splice(i, 1);
      if (this.maskReady) this.stepVeins();
    }
  }
}
