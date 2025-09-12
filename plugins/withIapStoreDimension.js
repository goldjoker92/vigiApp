// plugins/withIapStoreDimension.js
const { withAppBuildGradle, createRunOncePlugin } = require('@expo/config-plugins');

const PKG = { name: 'with-iap-store-dimension', version: '1.0.2' };
const TAG = '[withIapStoreDimension]';

function ensureMissingDimension(src) {
  try {
    if (!src || typeof src !== 'string') {
      console.log(`${TAG} no gradle content?`);
      return src;
    }

    // Déjà présent ?
    if (src.includes("missingDimensionStrategy 'store', 'play'") ||
        src.includes('missingDimensionStrategy "store", "play"')) {
      console.log(`${TAG} already present → skip`);
      return src;
    }

    // Cherche un bloc defaultConfig { ... }
    const reDefault = /defaultConfig\s*\{([\s\S]*?)\n\}/m;
    if (reDefault.test(src)) {
      console.log(`${TAG} found existing defaultConfig → injecting line inside`);
      const injected = src.replace(reDefault, (full) => {
        if (
          full.includes("missingDimensionStrategy 'store'") ||
          full.includes('missingDimensionStrategy "store"')
        ) {
          console.log(`${TAG} defaultConfig already has missingDimensionStrategy → skip`);
          return full;
        }
        const line =
          "\n        // Fix react-native-iap variants: prefer 'play' when 'store' is requested\n" +
          "        missingDimensionStrategy 'store', 'play'\n";
        return full.replace(/\n\}\s*$/m, `${line}    }\n`);
      });
      return injected;
    }

    // Sinon, insère un defaultConfig minimal sous "android {"
    const reAndroid = /android\s*\{/m;
    if (reAndroid.test(src)) {
      console.log(`${TAG} no defaultConfig found → creating a minimal one under android {}`);
      const block =
        "    defaultConfig {\n" +
        "        // Fix react-native-iap variants: prefer 'play' when 'store' is requested\n" +
        "        missingDimensionStrategy 'store', 'play'\n" +
        "    }\n";
      return src.replace(reAndroid, (m) => `${m}\n${block}`);
    }

    console.warn(`${TAG} could not find 'android {' block → no changes applied`);
    return src;
  } catch (e) {
    console.warn(`${TAG} injection failed:`, e?.message || e);
    return src;
  }
}

const withIapStoreDimension = (config) =>
  withAppBuildGradle(config, (c) => {
    console.log(`${TAG} start`);
    c.modResults.contents = ensureMissingDimension(c.modResults.contents);
    console.log(`${TAG} done`);
    return c;
  });

module.exports = createRunOncePlugin(withIapStoreDimension, PKG.name, PKG.version);
