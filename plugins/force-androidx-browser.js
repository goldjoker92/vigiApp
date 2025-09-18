// plugins/force-androidx-browser.js
const { withAppBuildGradle } = require('@expo/config-plugins');

// Injecte : implementation('androidx.browser:browser:1.9.1') { force = true }
module.exports = (config) =>
  withAppBuildGradle(config, (cfg) => {
    const addLine = "implementation('androidx.browser:browser:1.9.1') { force = true }";
    if (!cfg.modResults.contents.includes(addLine)) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /dependencies\s*\{/,
        `dependencies {\n    ${addLine}`
      );
    }
    return cfg;
  });
