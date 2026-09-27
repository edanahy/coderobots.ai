import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: { ...globals.browser, __APP_VERSION__: 'readonly' },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      // `try { cleanup() } catch {}` is deliberate best-effort cleanup (21 sites).
      'no-empty': ['error', { allowEmptyCatch: true }],
      'react-refresh/only-export-components': ['error', {
        allowConstantExport: true,   // keep the vite preset's default
        allowExportNames: ['debugLog'],
      }],
    },
  },
  {
    // Context modules export a Provider + its hook by design (AuthContext,
    // LanguageContext, SessionContext); fast-refresh just full-reloads them.
    files: ['src/contexts/**/*.jsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    // Runs as a Web Worker (importScripts, self), not a page.
    files: ['public/pyodideWorker.js'],
    languageOptions: { globals: { ...globals.worker } },
  },
  {
    // UMD-style guarded `typeof module !== 'undefined'` export at the bottom.
    files: ['public/lego-education-ble.js'],
    languageOptions: { globals: { module: 'readonly' } },
  },
])
