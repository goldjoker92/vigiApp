// jest.setup.jsx

import '@testing-library/jest-native/extend-expect';

/* global jest */ // Add this line to declare jest as a global variable

// Mock Reanimated pour éviter les crashs en test
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

// Coupe les warnings Animated bruyants
jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');

// Mock léger d'expo-router (pas de vraie navigation en test)
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  usePathname: () => '/',
}));
