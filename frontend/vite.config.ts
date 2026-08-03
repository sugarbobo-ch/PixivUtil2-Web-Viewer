import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const frontendDirectory = dirname(fileURLToPath(import.meta.url));
const webConfigPath = resolve(frontendDirectory, '../web_config.json');

const shouldOpenBrowser = (): boolean => {
  try {
    const config = JSON.parse(readFileSync(webConfigPath, 'utf-8')) as { autoOpenBrowser?: unknown };
    return config.autoOpenBrowser !== false;
  } catch {
    return true;
  }
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: shouldOpenBrowser(),
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      }
    }
  }
})
