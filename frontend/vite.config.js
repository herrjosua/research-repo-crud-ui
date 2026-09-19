import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
  },
  resolve: {
    alias: [
      // Carbon's own SCSS (node_modules/@carbon/styles/scss/_config.scss)
      // sets $font-path: '~@ibm/plex', a webpack/sass-loader convention for
      // resolving a node_modules package from inside a stylesheet. Vite's
      // Sass processing doesn't understand the leading "~" the way
      // webpack did, so the literal string leaks through into a font
      // url() unresolved, Vite's dev server can't match it to a real
      // file, and falls back to serving index.html — which the browser
      // then fails to decode as a font ("invalid sfntVersion"). Stripping
      // a leading "~" from any resolved path fixes this generally,
      // without touching node_modules directly (which npm install would
      // just overwrite anyway).
      { find: /^~/, replacement: '' },
    ],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './vitest.setup.js',
    globals: true,
  },
})
