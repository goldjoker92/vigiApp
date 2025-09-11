// .eslintrc.js (à la racine du repo)
// Documentation: https://docs.expo.dev/guides/using-eslint/

const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  // ✅ Expo/React Native recommended rules
  expoConfig,

  // ✅ Règles globales (front + back)
  {
    ignores: ["dist/*"],

    env: {
      es6: true,
      node: true,
      browser: true,
    },
    parserOptions: {
      ecmaVersion: 2018,
      sourceType: "module",
    },
    extends: [
      "eslint:recommended",
      "google", // style guide Google
    ],
    rules: {
      "no-restricted-globals": ["error", "name", "length"],
      "prefer-arrow-callback": "error",
      "quotes": ["error", "double", { allowTemplateLiterals: true }],

      // 🚫 Interdit console.log direct en prod
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
    overrides: [
      {
        files: ["**/*.spec.*"],
        env: { mocha: true },
        rules: {},
      },
      {
        // ✅ Pour le front (JS/TS/React Native)
        files: ["app/**/*.js", "src/**/*.jsx", "src/**/*.ts", "src/**/*.tsx"],
        env: { browser: true, es6: true },
        rules: {
          "no-console": "error", // log direct interdit
        },
      },
      {
        // ✅ Pour le backend Firebase
        files: ["functions/**/*.js"],
        env: { node: true },
      },
    ],
  },
]);
