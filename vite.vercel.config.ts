import tailwindcss from '@tailwindcss/postcss';
import { nitro } from 'nitro/vite';
import vinext from 'vinext';
import { defineConfig } from 'vite';

// Vercel needs its own server function and routing manifest. The default
// vite.config.ts remains the Cloudflare Workers / Sites build.
export default defineConfig({
  css: { postcss: { plugins: [tailwindcss()] } },
  // Resolve CSS package imports during RSC/SSR builds instead of treating them
  // as Node runtime dependencies.
  environments: {
    rsc: {
      resolve: { noExternal: ['tailwindcss', 'tw-animate-css', 'shadcn'] },
    },
    ssr: {
      resolve: { noExternal: ['tailwindcss', 'tw-animate-css', 'shadcn'] },
    },
  },
  plugins: [
    vinext(),
    nitro({
      preset: 'vercel',
      vercel: {
        functions: { runtime: 'nodejs24.x', maxDuration: 60 },
      },
    }),
  ],
});
