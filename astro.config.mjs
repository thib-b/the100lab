import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

// Served from a GitHub Pages project subpath (thib-b.github.io/the100lab). The deploy workflow
// sets PAGES_BASE=/the100lab; local dev + e2e leave it unset so everything stays at root.
// All hardcoded asset/link paths are prefixed with import.meta.env.BASE_URL so both resolve.
export default defineConfig({
  site: 'https://thib-b.github.io',
  base: process.env.PAGES_BASE ?? '/',
  integrations: [mdx()],
  // View Transitions are enabled per-page via <ClientRouter/> in BaseLayout.
  // Disable smartypants so migrated content renders with its exact source characters
  // (straight quotes/apostrophes) instead of being silently rewritten to typographic ones.
  markdown: { smartypants: false },
});
