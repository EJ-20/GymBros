import { defineConfig } from 'vite';

/** GitHub project Pages: https://<user>.github.io/<repo>/ — build with VITE_BASE_PATH=/<repo>/ */
const rawBase = process.env.VITE_BASE_PATH?.trim() || '/';
const base = rawBase === '/' || rawBase === '' ? '/' : rawBase.endsWith('/') ? rawBase : `${rawBase}/`;

export default defineConfig({
  base,
  server: {
    port: 5174,
  },
});
