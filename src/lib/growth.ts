import { inkFor } from './color';

// Canvas-2D "growing medium": persistent white/dark colonies colonise the whole viewport,
// and — on the splash only — slime-mould veins seed on the Hundred Pieces stamp outline and
// fill the letterforms until the title is readable. Every system is paced by one shared
// growth clock (gProg) so the background and the reveal grow on the same timeframe.

type Colony = { idx: number; x: number; y: number; diam: number; p: number; al: number; rot: number; col: string };
type Tip = { col: string; x: number; y: number; ang: number; life: number; w: number };

const WHITES = ['#f4f3ee', '#eae6da', '#f2eee6'];
const DARKS = ['#1c1b17', '#262521', '#2f3a26', '#241f1b', '#1f302e', '#33322c'];
const S = 170;            // colony sprite size
const DUR = 4200;         // frames for the plate to fully colonise (~70s at 60fps)

const rnd = (a = 1, b = 0) => b + Math.random() * (a - b);
const pick = <T>(a: T[]): T => a[(Math.random() * a.length) | 0];

function lobe(x: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.62, 'rgba(255,255,255,0.88)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, 6.2832); x.fill();
}
// a clustered colony: a main lobe plus a few offset lobes -> lumpy, defined silhouette
function genCluster(): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const x = cv.getContext('2d')!;
  lobe(x, S / 2, S / 2, S * 0.30);
  const n = 4 + ((Math.random() * 4) | 0);
  for (let i = 0; i < n; i++) {
    const a = rnd(6.2832), d = rnd(S * 0.28, S * 0.10);
    lobe(x, S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, rnd(S * 0.19, S * 0.09));
  }
  return cv;
}

export class GrowthGround {
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private acc = document.createElement('canvas');           // persistent growth (never cleared except restart)
  private ac = this.acc.getContext('2d')!;
  private mk = document.createElement('canvas');            // stamp alpha
  private mx = this.mk.getContext('2d')!;
  private variants: HTMLCanvasElement[] = [];
  private tintCache = new Map<string, HTMLCanvasElement>();
  private colonies: Colony[] = [];
  private matured = 0;
  private tips: Tip[] = [];
  private seededTips = 0;
  private W = 0; private H = 0; private dpr = 1;
  private age = 0; private g = 0;
  private ink: string;
  private reduced = matchMedia('(prefers-reduced-motion:reduce)').matches;
  private raf = 0; private running = false; private pendingSettle = false;
  // reveal (splash only)
  private revealRequested = false; private maskReady = false;
  private stamp?: HTMLImageElement; private maskImg?: Uint8ClampedArray;
  private edgePts: { x: number; y: number }[] = [];
  private cxc = 0; private cyc = 0; private nogoR = 0; private stampSize = 0;

  constructor(private el: HTMLElement, opts: { groundHex: string }) {
    this.ink = inkFor(opts.groundHex);
    for (let i = 0; i < 6; i++) this.variants.push(genCluster());
    this.canvas.setAttribute('aria-hidden', 'true');
    this.el.appendChild(this.canvas);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.size();
    addEventListener('resize', this.size);
    document.addEventListener('visibilitychange', this.onVis);
    if (this.reduced) { this.pendingSettle = true; queueMicrotask(() => this.trySettle()); return; }
    this.loop();
  }
  stop() {
    this.running = false; cancelAnimationFrame(this.raf);
    removeEventListener('resize', this.size);
    document.removeEventListener('visibilitychange', this.onVis);
  }

  // Called on the splash: load the stamp, then activate the no-go zone + vein reveal.
  enableReveal(stampUrl: string) {
    if (this.revealRequested) return;
    this.revealRequested = true;
    const img = new Image();
    img.onload = () => {
      this.stamp = img; this.buildMask(); this.maskReady = true;
      if (this.reduced && this.pendingSettle) this.trySettle();
    };
    img.src = stampUrl;
  }

  private onVis = () => {
    if (document.hidden) cancelAnimationFrame(this.raf);
    else if (this.running && !this.reduced) this.loop();
  };

  private size = () => {
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    const r = this.el.getBoundingClientRect();
    this.W = Math.max(2, r.width || innerWidth);
    this.H = Math.max(2, r.height || innerHeight);
    // preserve accumulated growth across a resize
    const prev = document.createElement('canvas');
    prev.width = this.acc.width || 1; prev.height = this.acc.height || 1;
    prev.getContext('2d')!.drawImage(this.acc, 0, 0);
    for (const cv of [this.canvas, this.acc]) { cv.width = this.W * this.dpr; cv.height = this.H * this.dpr; }
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ac.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ac.drawImage(prev, 0, 0, prev.width / this.dpr, prev.height / this.dpr);
    this.cxc = this.W / 2; this.cyc = this.H * 0.40;   // reveal sits in the upper-centre, leaving room for the CTA
    if (this.maskReady) this.buildMask();
  };

  private buildMask() {
    if (!this.stamp) return;
    this.mk.width = this.W * this.dpr; this.mk.height = this.H * this.dpr;
    this.mx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); this.mx.clearRect(0, 0, this.W, this.H);
    // Size the stamp off the vertical space (a bit under half the height), capped by width so it
    // never overflows a narrow/portrait screen. Keeps desktop ~the same while making mobile bigger.
    const size = Math.min(this.H * 0.44, this.W * 0.80);
    this.stampSize = size;
    const ox = this.cxc - size / 2, oy = this.cyc - size / 2;
    this.mx.drawImage(this.stamp, ox, oy, size, size);
    this.maskImg = this.mx.getImageData(0, 0, this.W * this.dpr, this.H * this.dpr).data;
    this.nogoR = size * 0.72;   // fully enclose the stamp square (half-diagonal ~0.707) so no colony spawns over the reveal
    this.edgePts = [];
    const step = Math.max(3, Math.round(3 * this.dpr));
    const A = (px: number, py: number) => {
      px = (px * this.dpr) | 0; py = (py * this.dpr) | 0;
      if (px < 0 || py < 0 || px >= this.W * this.dpr || py >= this.H * this.dpr) return 0;
      return this.maskImg![(py * this.W * this.dpr + px) * 4 + 3];
    };
    for (let y = oy; y < oy + size; y += step / this.dpr)
      for (let x = ox; x < ox + size; x += step / this.dpr) {
        if (A(x, y) > 70) {
          const d = step / this.dpr + 1;
          if (A(x - d, y) < 70 || A(x + d, y) < 70 || A(x, y - d) < 70 || A(x, y + d) < 70) this.edgePts.push({ x, y });
        }
      }
  }
  private inMask(x: number, y: number) {
    if (!this.maskImg) return false;
    const px = (x * this.dpr) | 0, py = (y * this.dpr) | 0;
    if (px < 0 || py < 0 || px >= this.W * this.dpr || py >= this.H * this.dpr) return false;
    return this.maskImg[(py * this.W * this.dpr + px) * 4 + 3] > 70;
  }
  private inNoGo(x: number, y: number) {
    if (!this.maskReady) return false;
    const dx = x - this.cxc, dy = y - this.cyc;
    return dx * dx + dy * dy < this.nogoR * this.nogoR;
  }

  private tinted(idx: number, col: string): HTMLCanvasElement {
    const key = idx + col; const hit = this.tintCache.get(key); if (hit) return hit;
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const x = cv.getContext('2d')!;
    x.drawImage(this.variants[idx], 0, 0);
    x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, S, S);
    this.tintCache.set(key, cv); return cv;
  }
  private scaleFor(p: number) { const s = p * p * p * (p * (p * 6 - 15) + 10); return 0.04 + 0.96 * s; } // ease-in-out
  private capCol() { return Math.round(this.W * this.H / 26000 * 0.9); }
  private colColour() { return Math.random() < 0.5 ? pick(WHITES) : pick(DARKS); }

  private spawnColony() {
    let x = 0, y = 0, tries = 0;
    do { x = rnd(this.W); y = rnd(this.H); tries++; } while (this.inNoGo(x, y) && tries < 12);
    if (this.inNoGo(x, y)) return;
    const diam = Math.min(this.W, this.H) * rnd(0.17, 0.075);
    this.colonies.push({ idx: (Math.random() * this.variants.length) | 0, x, y, diam, p: 0, al: rnd(0.9, 0.66), rot: rnd(6.2832), col: this.colColour() });
  }
  private stampColony(b: Colony, g: CanvasRenderingContext2D) {
    const d = b.diam * this.scaleFor(b.p), t = this.tinted(b.idx, b.col);
    g.save(); g.translate(b.x, b.y); g.rotate(b.rot); g.globalAlpha = b.al;
    g.drawImage(t, -d / 2, -d / 2, d, d); g.restore();
  }

  private seedStamp() {
    const p = pick(this.edgePts);
    this.tips.push({ col: this.ink, x: p.x, y: p.y, ang: rnd(6.2832), life: rnd(70, 35), w: rnd(0.85, 0.45) });
  }
  private stepVeins() {
    const sp = this.stampSize * 0.00126;   // crawl speed tracks the stamp size, so the reveal grows at a consistent rate on any screen
    const sTarget = Math.round(this.edgePts.length * 1.15 * this.g); // fill tracks the shared clock
    while (this.seededTips < sTarget) { this.seedStamp(); this.seededTips++; }
    this.ac.lineCap = 'round';
    for (let i = this.tips.length - 1; i >= 0; i--) {
      const t = this.tips[i];
      t.ang += rnd(0.7, -0.7);
      const nx = t.x + Math.cos(t.ang) * sp, ny = t.y + Math.sin(t.ang) * sp;
      if (this.inMask(nx, ny)) {
        this.ac.strokeStyle = t.col; this.ac.globalAlpha = rnd(0.6, 0.34); this.ac.lineWidth = t.w * rnd(1.3, 0.65);
        this.ac.beginPath(); this.ac.moveTo(t.x, t.y); this.ac.lineTo(nx, ny); this.ac.stroke();
        t.x = nx; t.y = ny;
        if (Math.random() < 0.03 && this.tips.length < 16000)
          this.tips.push({ col: t.col, x: t.x, y: t.y, ang: t.ang + rnd(1.2, .5) * (Math.random() < .5 ? 1 : -1), life: t.life * 0.72, w: Math.max(0.35, t.w * 0.9) });
      } else {
        if (Math.random() < 0.5) { // fray the letter edge: a faint short hair just past the boundary
          this.ac.strokeStyle = t.col; this.ac.globalAlpha = rnd(0.34, 0.14); this.ac.lineWidth = t.w * 0.8;
          this.ac.beginPath(); this.ac.moveTo(t.x, t.y); this.ac.lineTo(nx, ny); this.ac.stroke();
        }
        t.ang = rnd(6.2832); t.life -= 3;
      }
      if (--t.life <= 0) this.tips.splice(i, 1);
    }
    this.ac.globalAlpha = 1;
  }

  private grow() {
    this.age += 1; this.g = Math.min(1, this.age / DUR);
    const canColony = !this.revealRequested || this.maskReady; // wait for the mask before colonising the centre
    if (canColony && this.matured + this.colonies.length < this.capCol() * this.g && Math.random() < 0.14) this.spawnColony();
    for (let i = this.colonies.length - 1; i >= 0; i--) {
      const b = this.colonies[i]; b.p += 0.0020;
      if (b.p >= 1) { b.p = 1; this.stampColony(b, this.ac); this.colonies.splice(i, 1); this.matured++; }
    }
    if (this.maskReady) this.stepVeins();
  }
  private render() {
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.clearRect(0, 0, this.W, this.H);        // transparent: the body --ground shows through
    this.ctx.drawImage(this.acc, 0, 0, this.W, this.H);
    for (const b of this.colonies) this.stampColony(b, this.ctx);
  }
  private loop = () => { this.raf = requestAnimationFrame(this.loop); this.grow(); this.render(); };

  // reduced-motion: fast-forward to a settled plate, then hold a static frame
  private trySettle() {
    if (this.revealRequested && !this.maskReady) return; // wait for the mask first
    this.pendingSettle = false; this.g = 1; this.age = DUR;
    for (let k = 0; k < 3600; k++) {
      if (this.matured + this.colonies.length < this.capCol() && Math.random() < 0.05) this.spawnColony();
      for (let i = this.colonies.length - 1; i >= 0; i--) {
        const b = this.colonies[i]; b.p += 0.02;
        if (b.p >= 1) { b.p = 1; this.stampColony(b, this.ac); this.colonies.splice(i, 1); this.matured++; }
      }
      if (this.maskReady) this.stepVeins();
    }
    this.render();
  }
}
