// babel.config.js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['.'],
          alias: {
            '@/utils': './utils',
            '@/hooks': './hooks',
            '@/constants': './constants',
            '@/assets': './assets',
            '@/store': './store',
            '@/app': './app',
          },
          extensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'],
        },
      ],
      // ⚠️ doit rester en dernier, sinon Reanimated fait des siennes
      'react-native-reanimated/plugin',
    ],
  };
};