import { Application, Container, Sprite, Texture } from 'pixi.js';
import { inkFor } from './color';

// Soft radial blob texture generated once via an offscreen canvas.
function softTexture(): Texture {
  const s = 128, c = document.createElement('canvas'); c.width = c.height = s;
  const x = c.getContext('2d')!; const g = x.createRadialGradient(s/2, s/2, 0, s/2, s/2, s/2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, s, s);
  return Texture.from(c);
}

type Blob = { s: Sprite; t: number; life: number; maxScale: number };

export class GrowthGround {
  private app = new Application();
  private layer = new Container();
  private tex!: Texture;
  private blobs: Blob[] = [];
  private intensity: number;
  private tint: number;              // spore colour, contrast-derived from the ground
  private reduced = matchMedia('(prefers-reduced-motion:reduce)').matches;
  private ready = false;
  constructor(private el: HTMLElement, opts: { groundHex: string; intensity?: number }) {
    this.intensity = opts.intensity ?? 0.4;
    // Spores take the ink colour: dark colonies on light grounds, pale on dark — like mould on agar.
    this.tint = parseInt(inkFor(opts.groundHex).slice(1), 16);
  }
  async start() {
    if (this.ready) return;
    await this.app.init({ resizeTo: window, backgroundAlpha: 0, antialias: true });
    this.el.appendChild(this.app.canvas);
    this.app.stage.addChild(this.layer);
    this.tex = softTexture();
    this.ready = true;
    if (this.reduced) { this.scatterStatic(); this.app.ticker.stop(); return; }
    this.app.ticker.add(() => this.tick());
    document.addEventListener('visibilitychange', () => {
      document.hidden ? this.app.ticker.stop() : this.app.ticker.start();
    });
  }
  setIntensity(n: number) { this.intensity = n; }
  private spawn() {
    const s = new Sprite(this.tex);
    s.anchor.set(0.5); s.alpha = 0; s.tint = this.tint;
    s.x = Math.random() * this.app.renderer.width;
    s.y = Math.random() * this.app.renderer.height;
    const maxScale = 0.9 + Math.random() * 2.6; s.scale.set(maxScale * 0.15);
    this.layer.addChild(s);
    this.blobs.push({ s, t: 0, life: 3.5 + Math.random() * 3, maxScale });
  }
  private scatterStatic() {
    for (let i = 0; i < 28; i++) { this.spawn(); const b = this.blobs[i];
      b.s.alpha = 0.3 + Math.random() * 0.22; b.s.scale.set(b.maxScale); }
  }
  private tick() {
    const target = Math.round(44 * (0.25 + 1.75 * this.intensity));
    if (this.blobs.length < target && Math.random() < 0.5) this.spawn();
    const dt = this.app.ticker.deltaMS / 1000;
    for (let i = this.blobs.length - 1; i >= 0; i--) {
      const b = this.blobs[i]; b.t += dt; const k = b.t / b.life;
      if (k >= 1) { this.layer.removeChild(b.s); b.s.destroy(); this.blobs.splice(i, 1); continue; }
      b.s.scale.set(b.s.scale.x + (b.maxScale - b.s.scale.x) * 0.03);
      b.s.alpha = Math.sin(k * Math.PI) * 0.55 * (0.5 + this.intensity);
    }
  }
  stop() { this.app.ticker.stop(); }
}
