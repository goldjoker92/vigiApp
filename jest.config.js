module.exports = {
  preset: 'jest-expo',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  // si tu as encore des soucis avec des modules ESM, dé-commente ci-dessous
  // transformIgnorePatterns: [
  //   "node_modules/(?!(@react-native|react-native|expo(nent)?|@expo(nent)?/.*|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)/)"
  // ],
};
