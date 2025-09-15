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
            '@': './', // <— fallback générique
            '@/utils': './utils',
            '@/hooks': './hooks',
            '@/constants': './constants',
            '@/assets': './assets',
            '@/store': './store',
            '@/app': './app',
          },
          extensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs', '.json'],
        },
      ],
      'react-native-reanimated/plugin', // doit rester en dernier
    ],
  };
};
// doit rester en dernier
