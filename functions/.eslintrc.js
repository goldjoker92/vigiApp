module.exports = {
  env: {
    es6: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 2018,
  },
  extends: [
    "eslint:recommended",
    "google",
  ],
  rules: {
    "no-restricted-globals": ["error", "name", "length"],
    "prefer-arrow-callback": "error",
    "quotes": ["error", "double", { allowTemplateLiterals: true }],

    // 🚫 Interdit console.log & cie en prod
    "no-console": ["error", { allow: ["warn", "error"] }],
  },
  overrides: [
    {
      files: ["**/*.spec.*"],
      env: {
        mocha: true,
      },
      rules: {},
    },
    {
      // ✅ En dev, on autorise log via un wrapper (log(...) interne)
      files: ["**/*.jsx", "**/*.js", "**/*.ts", "**/*.tsx"],
      rules: {
        "no-console": "error", // log direct interdit
      },
    },
  ],
  globals: {},
};
