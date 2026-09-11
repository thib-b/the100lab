import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

// Served at the root of the custom domain (robocobraquartet.com) via GitHub Pages. `base` stays
// PAGES_BASE-driven but defaults to '/', and the deploy workflow no longer sets PAGES_BASE, so the
// site builds for root. All asset/link paths use import.meta.env.BASE_URL, so root serving is
// automatic (local dev + e2e already run at root).
export default defineConfig({
  site: 'https://robocobraquartet.com',
  base: process.env.PAGES_BASE ?? '/',
  integrations: [mdx()],
  // View Transitions are enabled per-page via <ClientRouter/> in BaseLayout.
  // Disable smartypants so migrated content renders with its exact source characters
  // (straight quotes/apostrophes) instead of being silently rewritten to typographic ones.
  markdown: { smartypants: false },
});
