// eslint.config.js — Flat config (ESLint v9, CommonJS)
const expo = require('eslint-config-expo/flat');

const isCI = process.env.CI === 'true';
const noConsoleRule = isCI
  ? ['error', { allow: ['warn', 'error'] }]
  : ['warn', { allow: ['warn', 'error'] }];

module.exports = [
  // Base Expo + React/TS/JSX
  ...expo,

  // Fichiers/dossiers à ignorer
  {
    ignores: [
      'dist/**',
      'build/**',
      'web-build/**',
      '.expo/**',
      '.expo-shared/**',
      '.metro-cache/**',
      'coverage/**',
      'reports/**',
      'functions/lib/**',
    ],
  },

  // Règles communes JS/TS/JSX/TSX
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
    },
    rules: {
      // Sévérité console : error en CI, warn en local
      'no-console': noConsoleRule,

      // Sanity rules
      'no-unused-vars': 'warn',
      'no-undef': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      semi: ['error', 'always'],

      // Style délégué à Prettier
      quotes: 'off',
      indent: 'off',
      'comma-dangle': 'off',
      'arrow-parens': 'off',

      // Un petit bonus lisibilité
      'prefer-arrow-callback': 'warn',
    },
  },

  // Front (app/src) : console en warn
  {
    files: ['app/**/*.{js,jsx,ts,tsx}', 'src/**/*.{js,jsx,ts,tsx}'],
    rules: {
      'no-console': 'warn',
    },
  },

  // Back (functions) : console strict
  {
    files: ['functions/**/*.js'],
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
];
// Note: si tu utilises des fichiers .cjs/.mjs, ajoute une section spécifique pour eux
