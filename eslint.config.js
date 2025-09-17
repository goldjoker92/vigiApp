// eslint.config.js — Flat config (ESLint v9)
const expo = require('eslint-config-expo/flat');

const isCI = process.env.CI === 'true';

// Front: on tolère console.* (WARN en local, ERROR en CI)
const frontConsoleRule = isCI
  ? ['error', { allow: ['warn', 'error'] }]
  : ['warn', { allow: ['warn', 'error'] }];

// Back (functions): on LOG sans drama (WARN au pire)
const functionsConsoleRule = isCI
  ? ['warn', { allow: ['warn', 'error', 'log', 'info'] }]
  : 'off';

module.exports = [
  // Base Expo (React/JS/TS)
  ...expo,

  // Ignorés globaux
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '.expo/**',
      '.expo-shared/**',
      '.turbo/**',
      '.metro-cache/**',
      'web-build/**',
      // artefacts functions
      'functions/lib/**',
      'functions/dist/**',
    ],
  },

  // Règles communes
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        // Globals React Native utiles côté front
        __DEV__: 'readonly',
        fetch: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        FormData: 'readonly',
      },
    },
    rules: {
      // Sécurité
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      // Confort
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      // Style délégué à Prettier (si tu l’utilises)
      quotes: 'off',
      indent: 'off',
      semi: ['error', 'always'],
      'comma-dangle': 'off',
      'arrow-parens': 'off',
      // Hooks
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // FRONT (app/, src/…) : console cool (WARN en local)
  {
    files: ['app/**/*.{js,jsx,ts,tsx}', 'src/**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      globals: {
        // parfois utiles avec Expo Router
        module: 'readonly',
        require: 'readonly',
      },
    },
    rules: {
      'no-console': frontConsoleRule,
    },
  },

  // BACK — Firebase Functions
  {
    files: ['functions/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        // Node globals
        process: 'readonly',
        module: 'readonly',
        require: 'readonly',
        __dirname: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      // On n’interdit pas console.* en back
      'no-console': functionsConsoleRule,
      // Toujours strict sur ===
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      // Les “undefined” en back proviennent souvent d’imports manquants
      'no-undef': 'error',
    },
  },

  // TESTS
  {
    files: ['**/*.{spec,test}.{js,jsx,ts,tsx}', '**/__mocks__/**/*'],
    languageOptions: {
      globals: { jest: 'readonly', expect: 'readonly' },
    },
    rules: {
      'no-undef': 'off',
      'no-console': 'off',
    },
  },
];
