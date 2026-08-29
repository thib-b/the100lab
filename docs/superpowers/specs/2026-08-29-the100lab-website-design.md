# the100lab — Website Design Spec

*Date: 2026-08-29 · Status: Draft for review · Repo: `thib-b/the100lab`*

## Context

Robocobra Quartet are releasing a new album, **"THE HUNDRED"** (working name "The 100") — 100
tracks, ~6–7 hours, with artwork made by photographing DIY agar/petri-dish plates grown with
food dyes. They need a **new website** that becomes the band's complete home, superseding the
old Jekyll site at `thib-b/rq` (served at robocobraquartet.com/rq).

This is a fresh build. The earlier `rq100` "lab" prototypes are explicitly **not** used as a
starting point or reference.

## Goals

- A **complete band site** (replacing `rq`) built around "THE HUNDRED".
- **Static, markdown-driven**, hostable on **GitHub Pages** at a **custom-domain root**.
- **Trivial to add new sections** later (e.g. a future photos section).
- A **subtle, site-wide growth animation** in the background and around visual elements.
- Cleanly **embed PixiJS** now (ambient layer) and later (MVP2 richer plate visualizations).
- Aesthetic-agnostic base: the final visual layer is finalized later with thib's direction.

## Non-goals (MVP1)

- The album **splash/landing screen** (MVP2).
- A **persistent, built-in music player** (MVP2).
- Rich/interactive **plate visualizations** beyond the subtle ambient layer (MVP2).
- New copy — MVP1 **reuses the exact existing `rq` content** verbatim (updates come later).

## Architecture

- **Astro** static site → builds to plain HTML/CSS/JS. No SPA; Vite is internal/zero-config.
- **Astro View Transitions (`<ClientRouter>`)** adopted from MVP1 so navigation is client-side
  and designated elements survive page changes via `transition:persist`. This keeps the ambient
  animation alive across navigation and gives MVP2's music player a ready persistence slot.
- **Content collections** (markdown/MDX), one entry per section. A small **site/nav config**
  drives the menu, so **adding a section = add a markdown entry + one nav line**.
- **Shared base layout** (header/nav, footer, persistent animation mount) + a per-section page
  template. Keep components small and single-purpose.

### Sitemap (MVP1 — mirrors current `rq`)

`home (index)`, `bio`, `tour`, `music`, `video`, `images`, `contact`. Content migrated verbatim
from the `rq` repo (`index.md`, `bio.md`, `tour.md`, `video.md`, `image.md`, `contact.md`, plus
`_data`/`_includes` values as needed). Media/images referenced by rq are copied into the new
repo's assets and optimized.

## Ambient growth animation

- A **lightweight, decorative** growth layer rendered with **PixiJS** on a single global client
  **island** that fills the viewport as the **borderless page ground** (Direction D) — spore
  blooms / organic growth in the hour's seeded colour, low-contrast so it never fights content.
  Not the full platev3 simulation.
- **Growth intensity is left to tune on a working build** (thib will judge "subtle vs. active"
  on the real site); the styleboard's default is a starting point only.
- **Persisted across navigation** (`transition:persist`) — never restarts.
- **Respects `prefers-reduced-motion`** (static fallback), **pauses when the tab is hidden**
  (Page Visibility API), and caps particle count / device-pixel-ratio for smooth mobile perf.
- Exposes config knobs (palette, density, speed) so MVP2's splash can reuse the same engine,
  dialed up.

## Visual identity — Direction "D: borderless, time-seeded" (chosen)

Chosen from the styleboard (https://claude.ai/code/artifact/b1429c22-adf4-4d8d-a1c7-92f56ac4da74),
grounded in `/Users/thib/dev/the100-visual-assets` (see its README).

- **Ground = a living, borderless plate.** No petri-dish rim/edge; the whole viewport is a
  single vivid **plate-derived colour**, with the growth animation rendered as its texture —
  the background *is* the plate.
- **Colour is time-seeded, hourly.** A deterministic seed from the current date+hour picks the
  ground colour from a curated palette sampled from the plate photos (turquoise, sulphur,
  coral, cobalt, chartreuse, fuchsia, violet, rust, magenta, …). Same for every visitor within
  the hour; it drifts hour to hour — consistent but ever-changing.
- **Readability by construction.** Ink colour (dark vs. light) is auto-selected from the
  seeded ground's luminance, and body-text blocks sit on a soft, blurred **legibility scrim**
  so copy stays readable on any seeded colour.
- **Accent:** red (as in the "100" mark and cover type). **Mark:** red **"100"** (three
  vertical ovals); title **"THE HUNDRED"**. **Type:** **Helvetica Neue** (self-hosted).
  `ReadyActiveTest` is unused — ignore unless asked.
- **Plate photography** (cover / singles / the 100 `spores-pics`) is still used as *content*
  imagery on relevant pages, but is not the page ground.

Assets are the master copy; only the specific images a page needs are copied/optimized into the
repo. Album cover = `Final Artwork5.jpg`; two singles = the two `Final Artwork_1080 x 1080*.jpg`;
100 plate photos in `spores-pics/`.

## Deployment & ops

- **GitHub Actions** workflow builds Astro and deploys to **GitHub Pages** on push to `main`.
- **Custom-domain root:** set Astro `site`; no `base`. Add `public/CNAME` once the domain is
  chosen; until then it deploys to the default Pages URL for preview.
- Repo hygiene: `.gitignore` (`node_modules`, `dist`, `.astro`), pinned Node, npm scripts.
- Work on a **feature branch**; commits/pushes only when thib asks (and never with any Claude
  authorship or attribution).

## Testing / verification

- `npm run build` and `astro check` pass; all migrated content renders; nav/links resolve at
  root; images load.
- Ambient animation runs, honors reduced-motion, pauses when hidden, no mobile jank
  (Lighthouse sanity pass).
- Local preview confirms view-transition navigation keeps the animation alive across pages.

## MVP2 (known, not built now)

- Album **splash/landing** screen for "THE HUNDRED".
- **Persistent built-in music player** across pages (drops into the `transition:persist` slot;
  audio source TBD — Bandcamp/Spotify/self-hosted).
- Richer **PixiJS plate visualizations** (reusing the ambient engine).
- Likely-new sections (e.g. **photos**) — trivial to add by design.

## Open items (to confirm)

- **Growth intensity / exact colour tuning** — judged on a working build (Direction D chosen,
  hourly seeding; the precise palette values and animation liveliness get dialed in on the
  real site).
- The **custom domain** name (for `site` + `CNAME`).
- **Music source** for MVP2's player.
- Any content the band wants **updated** vs. carried over verbatim.
