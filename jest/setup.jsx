import '@testing-library/jest-native/extend-expect';

/* global jest */
// Mocks stables pour tests RN/Expo
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

// Silence quelques warnings bruyants
const originalError = global.console.error;
global.console.error = (...args) => {
  const msg = String(args[0] || '');
  if (
    msg.includes('useNativeDriver') ||
    msg.includes('React state update on an unmounted component')
  ) {
    return;
  }
  originalError(...args);
};
