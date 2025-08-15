import { defineConfig, loadEnv } from 'vite';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { version } from "./package.json";
import fs from 'fs';
import path from 'path';
import mkcert from 'vite-plugin-mkcert';
// Custom plugin: serve & bundle raw HTML legal pages located under src/en & src/pl
// Dev: responds to /en/privacy.html, /pl/tos.html etc.
// Build: emits those files into dist/en/*.html & dist/pl/*.html
function legalPagesPlugin () {
  const pages = [['en', 'privacy'], ['en', 'tos'], ['pl', 'privacy'], ['pl', 'tos']];
  return {
    name: 'legal-pages',
    configureServer (server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next();
        const m = req.url.match(/^\/(en|pl)\/(privacy|tos)\.html?$/);
        if (m) {
          const [, lang, page] = m;
          const filePath = path.resolve(__dirname, 'src', lang, `${page}.html`);
          if (fs.existsSync(filePath)) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(fs.readFileSync(filePath));
            return;
          }
        }
        next();
      });
    },
    generateBundle () {
      for (const [lang, page] of pages) {
        const filePath = path.resolve(__dirname, 'src', lang, `${page}.html`);
        if (fs.existsSync(filePath)) {
          this.emitFile({
            type: 'asset',
            fileName: `${lang}/${page}.html`,
            source: fs.readFileSync(filePath, 'utf8')
          });
        }
      }
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const discordId = env.VITE_DISCORD_CLIENT_ID ? String(env.VITE_DISCORD_CLIENT_ID) : '';
  const randomval = Math.random().toString(36).substring(2, 15);

  // Plugin to inject build-time randomval into the copied service worker (public/sw.js)
  function resolveRandomvalPlugin (random) {
    return {
      name: 'resolve-randomval-sw',
      configureServer (server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/sw.js') {
            const swPath = path.resolve(__dirname, 'public', 'sw.js');
            if (fs.existsSync(swPath)) {
              const src = fs.readFileSync(swPath, 'utf8');
              res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
              // Replace every literal occurrence of 'randomval' with the generated value
              const replaced = src
                .replace(/randomval|__RANDOMVAL__/g, random)
                .replace(/__INDEX_CSS__/g, `./index-v${version}-${random}.css`)
                .replace(/__INDEX_JS__/g, `./index-v${version}-${random}.js`);
              res.end(replaced);
              return;
            }
          }
          next();
        });
      },
      closeBundle () {
        const outFile = path.resolve(__dirname, 'dist', 'sw.js');
        if (fs.existsSync(outFile)) {
          const current = fs.readFileSync(outFile, 'utf8');
          const updated = current
            .replace(/randomval|__RANDOMVAL__/g, random)
            .replace(/__INDEX_CSS__/g, `./index-v${version}-${random}.css`)
            .replace(/__INDEX_JS__/g, `./index-v${version}-${random}.js`);
          fs.writeFileSync(outFile, updated, 'utf8');
        }
      }
    };
  }
  return {
    server: {
      proxy: {
        '/api': {
          target: 'https://localhost:3001',
          changeOrigin: true,
          secure: false,
          ws: true,
        },
      },
      port: 3000,
      allowedHosts: [
        "serwer.gtadubbing.pl",
        "confirmed-mpg-queens-determining.trycloudflare.com"
      ],
    },
    plugins: [
      svelte({
        preprocess: vitePreprocess()
      }),
      mkcert(),
      legalPagesPlugin(),
      resolveRandomvalPlugin(randomval)
    ],
    define: {
      __DISCORD_CLIENT_ID__: JSON.stringify(discordId)
    },
    build: {
      rollupOptions: {
        output: {
          assetFileNames: `[name]-v${version}-${randomval}.[ext]`, //random value so discord internal server stops fucking caching my previous builds
          entryFileNames: `[name]-v${version}-${randomval}.js`,
          dir: "./dist",
        }
      }
    }
  };
});
