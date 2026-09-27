import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `storybook-static` is `build-storybook`'s output (gitignored, like `dist`) —
  // without it here, running lint after a Storybook build lints the bundle.
  globalIgnores(['dist', 'storybook-static']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
        // Injected by vite.config.js's `define`.
        __APP_VERSION__: 'readonly',
      },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    // vite.config.js sets test.globals: true, so test files use describe,
    // it, expect, vi, etc. without importing them.
    files: ['**/*.test.{js,jsx}'],
    languageOptions: {
      globals: globals.vitest,
    },
  },
  {
    // Runs in Node, not the browser.
    files: ['vite.config.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
])
