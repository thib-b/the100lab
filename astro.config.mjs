import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

// NOTE: `site` is a placeholder until the custom domain is chosen. Custom-domain root ⇒ no `base`.
export default defineConfig({
  site: 'https://the100lab.example',   // TODO(thib): real custom domain, then add public/CNAME
  integrations: [mdx()],
  // View Transitions are enabled per-page via <ClientRouter/> in BaseLayout.
  // Disable smartypants so migrated content renders with its exact source characters
  // (straight quotes/apostrophes) instead of being silently rewritten to typographic ones.
  markdown: { smartypants: false },
});
