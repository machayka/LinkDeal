// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

// Linki /contract/<adres> obsługuje jedna strona (contract.astro), która czyta adres z URL-a.
// Lokalnie przekierowuje je ten plugin, a na serwerze — reguła w Caddyfile.
const contractRoute = {
  name: 'contract-route',
  /** @param {import('vite').ViteDevServer} server */
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url?.startsWith('/contract/')) req.url = '/contract';
      next();
    });
  },
};

// https://astro.build/config
export default defineConfig({
  vite: {
    plugins: [tailwindcss(), contractRoute]
  }
});
