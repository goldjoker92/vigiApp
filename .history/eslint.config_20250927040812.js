// eslint.config.js — Flat config (ESLint v9)
const expo = require('eslint-config-expo/flat');

// Removed unused isCI variable

// Front: on tolère console.* totalement (plus aucun warning)
const frontConsoleRule = 'off';

// Back (functions): idem, console.* libre
const functionsConsoleRule = 'off';

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
      // Additional rules
      'no-unused-expressions': 'warn',
      'import/no-duplicates': 'warn',
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off',
    },
  },

  // FRONT (app/, src/…) : console tolérées
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
      'no-console': functionsConsoleRule,
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
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
