const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.resolver.alias = {
  '@': path.resolve(__dirname),
  '@/utils': path.resolve(__dirname, 'utils'),
  '@/hooks': path.resolve(__dirname, 'hooks'),
  '@/constants': path.resolve(__dirname, 'constants'),
  '@/assets': path.resolve(__dirname, 'assets'),
  '@/store': path.resolve(__dirname, 'store'),
  '@/app': path.resolve(__dirname, 'app'),
};

module.exports = config;
