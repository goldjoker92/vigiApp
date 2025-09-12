// eslint.config.js � Flat config (ESLint v9) en CommonJS
const expo = require('eslint-config-expo/flat');
const isCI = process.env.CI === 'true';
const noConsoleRule = isCI
  ? ['error', { allow: ['warn', 'error'] }]
  : ['warn', { allow: ['warn', 'error'] }];
module.exports = [
  ...expo,
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
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    rules: {
      'no-console': noConsoleRule, // warn en local, error en CI
      'prefer-arrow-callback': 'warn',
      quotes: 'off', // Prettier décide
    },
  },
  {
    files: ['app/**/*.{js,jsx,ts,tsx}', 'src/**/*.{js,jsx,ts,tsx}'],
    rules: { 'no-console': 'warn' }, // front = warn
  },
  {
    files: ['functions/**/*.js'],
    rules: { 'no-console': ['error', { allow: ['warn', 'error'] }] }, // back = strict
  },
];
