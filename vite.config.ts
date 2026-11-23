import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, existsSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

/**
 * Stamps the service worker with a release identifier after the bundle is
 * written. The hash covers the built assets, so any change to the app produces
 * a new cache name and the previous cache is evicted on activate. Without this
 * the worker's cache name is a constant, nothing is ever evicted, and a
 * returning user keeps the old bundle until they clear app data.
 */
function stampServiceWorker(): Plugin {
  return {
    name: 'bene-stamp-sw',
    apply: 'build',
    closeBundle() {
      const dist = 'dist';
      const swPath = join(dist, 'sw.js');
      if (!existsSync(swPath)) return;

      const assetsDir = join(dist, 'assets');
      const assets = existsSync(assetsDir) ? readdirSync(assetsDir).sort() : [];
      const digest = createHash('sha256');
      for (const file of assets) digest.update(file);
      // The lockfile-stable version is not enough on its own: two builds of the
      // same version with different code must still invalidate the cache.
      digest.update(readFileSync(join(dist, 'index.html')));
      const release = digest.digest('hex').slice(0, 12);

      const source = readFileSync(swPath, 'utf8');
      const stamped = source.replace('__BENE_RELEASE__', release);
      if (stamped === source) {
        this.warn('sw.js was not stamped: placeholder missing');
        return;
      }
      writeFileSync(swPath, stamped);
      this.info(`service worker cache → bene-${release}`);
    },
  };
}

export default defineConfig({
  plugins: [react(), stampServiceWorker()],
  base: './',
  server: { port: 5173, host: '0.0.0.0', allowedHosts: ['.trycloudflare.com'] },
  preview: { port: 4173, host: '0.0.0.0', allowedHosts: ['.trycloudflare.com'] },
  build: { target: 'es2024', sourcemap: false, chunkSizeWarningLimit: 1200 },
});
