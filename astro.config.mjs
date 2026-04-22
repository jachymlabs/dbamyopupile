import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://dbamyopupile.pl',
  output: 'server',
  adapter: vercel(),
  integrations: [sitemap(), react()],
  vite: {
    plugins: [tailwindcss()],
    envPrefix: ['PUBLIC_', 'VENDURE_', 'META_'],
  },
  server: {
    port: 4321,
    host: true,
  },
});
