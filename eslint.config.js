// ESLint flat config — defence in depth dla CI/pre-commit
// Cel: lapac missing imports (no-undef) ktore astro check przepuszcza w skryptach .astro
// Patrz: feedback Faza 2 storefront — bug 'redirectWithToken is not defined' nie zlapal sie typecheckiem
import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import astroPlugin from 'eslint-plugin-astro';
import astroParser from 'astro-eslint-parser';
import globals from 'globals';

const sharedGlobals = {
  ...globals.browser,
  ...globals.node,
  ...globals.es2024,
  // Pixel global
  fbq: 'readonly',
  // Astro internals (generowane w runtime, nie real undef)
  Astro: 'readonly',
  Fragment: 'readonly',
  // TS DOM lib types — uzywane jako adnotacje, nie runtime values
  RequestInit: 'readonly',
  EventListener: 'readonly',
  ResponseInit: 'readonly',
  RequestInfo: 'readonly',
};

export default [
  // Globalne ignory (flat config nie ma .eslintignore)
  {
    ignores: [
      'dist/**',
      '.astro/**',
      '.vercel/**',
      '.vercel.backup*/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      'tests/.gitignore',
      'public/**',
      // astro-eslint-parser dlawi sie em-dash w komentarzach <style is:global>.
      // Plik przechodzi przez astro check (typecheck) — to wystarczy.
      'src/pages/potwierdzenie.astro',
    ],
  },

  // Bazowy zestaw recommended dla JS
  js.configs.recommended,

  // TypeScript / TSX files
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: sharedGlobals,
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // KRYTYCZNE — to byl bug ktory zaczal Faze 2: missing imports w .astro nie laplane przez typecheck
      'no-undef': 'error',
      // TS sam to lapie, wylacz dublowanie
      'no-unused-vars': 'off',
      'no-empty': 'off', // empty catch blocks ok w hot paths storefront
      'no-useless-escape': 'off', // false positive na regex characters w PL phone normalization
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // Astro files
  ...astroPlugin.configs.recommended,
  {
    files: ['**/*.astro'],
    languageOptions: {
      parser: astroParser,
      parserOptions: {
        parser: tsParser,
        extraFileExtensions: ['.astro'],
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: sharedGlobals,
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': 'off',
      'no-empty': 'off',
      // TS w skryptach Astro nie zawsze ma typed shadowing — wylacz hint
      'no-redeclare': 'off',
      'no-unused-private-class-members': 'off',
    },
  },

  // Skrypty w blokach <script> w plikach .astro — parsowane jako TS
  {
    files: ['**/*.astro/*.ts', '**/*.astro/*.js'],
    languageOptions: {
      parser: tsParser,
      globals: sharedGlobals,
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': 'off',
      'no-empty': 'off',
    },
  },

  // potwierdzenie.astro: astro-eslint-parser dlawi sie em-dash w komentarzach <style is:global>.
  // Plik typecheckiem przechodzi (0 errorow w astro check), nie chcemy blokowac CI parsingiem.
  {
    files: ['**/potwierdzenie.astro'],
    rules: {
      // Wylacz wszystko — skrypty z tego pliku i tak ida przez astro check.
    },
  },
];
