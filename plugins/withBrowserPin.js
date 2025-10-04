const { withProjectBuildGradle } = require('@expo/config-plugins');

/**
 * Force androidx.browser:browser:1.8.0 pour rester en compileSdk 35 (Expo SDK 53 / AGP 8.8.x)
 * Injecte une resolutionStrategy au niveau du projet Gradle.
 */
module.exports = function withBrowserPin(config) {
  return withProjectBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;

    const block = `
allprojects {
  configurations.all {
    resolutionStrategy {
      force 'androidx.browser:browser:1.8.0'
    }
  }
}
`;

    if (!contents.includes('androidx.browser:browser:1.8.0')) {
      contents += `

/** === BEGIN browser pin (Expo config plugin) === **/
${block}
/** === END browser pin === **/
`;
    }

    cfg.modResults.contents = contents;
    return cfg;
  });
};
