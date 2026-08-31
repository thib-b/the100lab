import { inkFor } from './color';

// Canvas-2D "growing medium", split across two layered canvases for performance and look:
//   • blooms layer — soft branching-mycelium bursts (the background); rendered at reduced
//     resolution and softened with a single GPU CSS blur (no per-stroke shadowBlur).
//   • stamp layer  — the Hundred Pieces vein reveal; full resolution, crisp, unchanged.
// Growth is additive and drawn incrementally onto persistent canvases (never cleared/re-blitted),
// and the animation loop stops entirely once everything has finished growing (~0 CPU at rest).

type Tip = { x: number; y: number; ang: number; len: number; maxLen: number; w0: number; sp: number; col: string; gen: number };
type Vein = { x: number; y: number; ang: number; life: number; w: number };

const WHITES = ['#f4f3ee', '#eae6da', '#f2eee6'];
const DARKS = ['#1c1b17', '#262521', '#2f3a26', '#241f1b', '#1f302e', '#33322c'];
const DUR = 4200;                 // frames for the plate to fully colonise (~70s at 60fps)

// --- bloom look (tuned with thib; slider estimates on a 0..1 scale) ---
const BLOOM_BLUR_PX = 0.5;        // CSS blur on the blooms layer   (Blur ~0.15)
const BLOOM_COVER = 0.8;          // density of blooms              (Cover ~0.8)
const BLOOM_SIZE = 0.6;           // bloom reach multiplier         (Size ~0.15)
const BLOOM_THICK = 0.5;          // filament thickness multiplier  (Thick ~0.4)
const BLOOM_SPEED = 0.55;         // filament extension multiplier  (Speed ~0.2)

const rnd = (a = 1, b = 0) => b + Math.random() * (a - b);
const pick = <T>(a: T[]): T => a[(Math.random() * a.length) | 0];

// soft core sprite (white, tinted per bloom) — drawn once per burst
const CS = 96, softCore = document.createElement('canvas');
softCore.width = softCore.height = CS;
{
  const x = softCore.getContext('2d')!;
  const g = x.createRadialGradient(CS / 2, CS / 2, 0, CS / 2, CS / 2, CS / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, CS, CS);
}
const coreCache = new Map<string, HTMLCanvasElement>();
function tintedCore(col: string): HTMLCanvasElement {
  let c = coreCache.get(col); if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = CS;
  const x = c.getContext('2d')!;
  x.drawImage(softCore, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, CS, CS);
  coreCache.set(col, c); return c;
}

export class GrowthGround {
  private blooms = document.createElement('canvas');   // low-res, CSS-blurred
  private bc = this.blooms.getContext('2d')!;
  private stamp = document.createElement('canvas');    // full-res, crisp
  private sc = this.stamp.getContext('2d')!;
  private mk = document.createElement('canvas');       // stamp alpha mask
  private mx = this.mk.getContext('2d')!;
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
  private cxc = 0; private cyc = 0; private nogoR = 0; private stampSize = 0;

  constructor(private el: HTMLElement, opts: { groundHex: string }) {
    this.ink = inkFor(opts.groundHex);
    for (const c of [this.blooms, this.stamp]) c.setAttribute('aria-hidden', 'true');
    this.blooms.style.filter = `blur(${BLOOM_BLUR_PX}px)`;
    this.el.appendChild(this.blooms);   // blooms below
    this.el.appendChild(this.stamp);    // stamp on top (crisp)
  }

  start() {
    if (this.running && !this.reduced) return;
    this.size();
    addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVis);
    if (this.reduced) { this.pendingSettle = true; queueMicrotask(() => this.trySettle()); return; }
    this.kick();
  }
  stop() { this.running = false; cancelAnimationFrame(this.raf); removeEventListener('resize', this.onResize); document.removeEventListener('visibilitychange', this.onVis); }

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
    this.maskImg = this.mx.getImageData(0, 0, this.W * this.dprF, this.H * this.dprF).data;
    this.nogoR = size * 0.72;
    this.edgePts = [];
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
  private spawnBloom() {
    let bx = 0, by = 0, tries = 0;
    do { bx = rnd(this.W); by = rnd(this.H); tries++; } while (this.inNoGo(bx, by) && tries < 12);
    if (this.inNoGo(bx, by)) return;
    const col = Math.random() < 0.5 ? pick(WHITES) : pick(DARKS);
    const base = Math.min(this.W, this.H) / 760;
    const size = Math.min(this.W, this.H) * rnd(0.15, 0.07) * BLOOM_SIZE, bursts = 2 + ((Math.random() * 3) | 0), spd = rnd(1.25, 0.7);
    for (let b = 0; b < bursts; b++) {
      const off = size * 0.30, cx = bx + rnd(off, -off), cy = by + rnd(off, -off), cr = size * rnd(0.34, 0.2);
      this.bc.globalAlpha = 0.42; this.bc.drawImage(tintedCore(col), cx - cr, cy - cr, cr * 2, cr * 2); this.bc.globalAlpha = 1;
      const T = Math.round(rnd(26, 16)), rot = rnd(6.2832);
      for (let i = 0; i < T; i++) {
        const ang = rot + (i / T) * 6.2832 + rnd(0.6, -0.6);
        this.tips.push({ x: cx, y: cy, ang, len: 0, maxLen: size * rnd(1.15, 0.5), w0: rnd(2.6, 1.2) * BLOOM_THICK * base, sp: rnd(1.3, 0.7) * spd * BLOOM_SPEED * base, col, gen: 0 });
      }
    }
    this.bloomsSpawned++;
  }
  private stepBloomTip(t: Tip): boolean {
    const prog = t.len / t.maxLen;
    t.ang += rnd(0.62, -0.62);
    const sp = t.sp * (0.45 + 0.55 * Math.min(1, prog * 3));
    const nx = t.x + Math.cos(t.ang) * sp, ny = t.y + Math.sin(t.ang) * sp;
    const w = Math.max(0.35, t.w0 * (1 - 0.84 * prog));
    this.bc.strokeStyle = t.col; this.bc.globalAlpha = t.gen === 0 ? 0.5 : 0.4; this.bc.lineWidth = w;
    this.bc.beginPath(); this.bc.moveTo(t.x, t.y); this.bc.lineTo(nx, ny); this.bc.stroke();
    t.x = nx; t.y = ny; t.len += sp;
    if (Math.random() < 0.09 && t.gen < 3 && this.tips.length < 6000)
      this.tips.push({ x: t.x, y: t.y, ang: t.ang + rnd(1.1, .5) * (Math.random() < .5 ? 1 : -1), len: 0, maxLen: (t.maxLen - t.len) * rnd(0.7, 0.35), w0: Math.max(0.5, t.w0 * 0.72), sp: t.sp, col: t.col, gen: t.gen + 1 });
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
    for (let k = 0; k < 4200 && !this.settled(); k++) {
      if (this.bloomsSpawned < this.bloomTarget() && Math.random() < 0.5) this.spawnBloom();
      for (let i = this.tips.length - 1; i >= 0; i--) if (!this.stepBloomTip(this.tips[i])) this.tips.splice(i, 1);
      if (this.maskReady) this.stepVeins();
    }
  }
}
