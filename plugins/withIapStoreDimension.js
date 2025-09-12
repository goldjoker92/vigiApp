// plugins/withIapStoreDimension.js
const { withAppBuildGradle, createRunOncePlugin } = require('@expo/config-plugins');

const pkg = { name: 'with-iap-store-dimension', version: '1.0.0' };

function addMissingDimensionStrategy(gradle) {
  if (gradle.includes(`missingDimensionStrategy 'store'`)) return gradle;

  // Ajoute dans defaultConfig { ... }
  return gradle.replace(/defaultConfig\s*\{([\s\S]*?)\n\}/m, (match) => {
    if (match.includes(`missingDimensionStrategy 'store'`)) return match;
    const insertion = `\n        // Force la variante IAP "play" par défaut\n        missingDimensionStrategy 'store', 'play'\n`;
    return match.replace(/\n\}/m, `${insertion}    }\n`);
  });
}

const withIapStoreDimension = (config) => {
  return withAppBuildGradle(config, (config) => {
    config.modResults.contents = addMissingDimensionStrategy(config.modResults.contents);
    return config;
  });
};

module.exports = createRunOncePlugin(withIapStoreDimension, pkg.name, pkg.version);
