import '@testing-library/jest-native/extend-expect';

// RN Reanimated: mock stable pour éviter les erreurs dans Jest
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

// Calmer quelques warnings bruyants
const originalError = console.error;
console.error = (...args) => {
  const msg = String(args[0] || '');
  if (msg.includes('useNativeDriver') || msg.includes('React state update on an unmounted component')) return;
  return originalError(...args);
};