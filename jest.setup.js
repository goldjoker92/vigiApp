import '@testing-library/jest-native/extend-expect';

// Désactive les warnings Animated Native
jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');

// Mock react-native-reanimated (v2/v3)
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  // no-op pour call etc.
  Reanimated.default.call = () => {};
  return Reanimated;
});

// Mock react-native-gesture-handler (basique)
jest.mock('react-native-gesture-handler', () => {
  return {
    GestureHandlerRootView: ({ children }) => children,
    PanGestureHandler: ({ children }) => children,
    State: {},
  };
});

// Mock react-native-maps
jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MapView = (props) => React.createElement(View, props, props.children);
  const Marker = (props) => React.createElement(View, props, props.children);
  return { __esModule: true, default: MapView, Marker };
});

// Mock lucide-react-native → composants vides
jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  const make = (name) => (p) => React.createElement(View, { ...p, testID: name });
  return new Proxy({}, { get: (_, prop) => make(prop) });
});

// Valeurs d'env utilisées dans Report
process.env.EXPO_PUBLIC_FUNCTIONS_BASE = process.env.EXPO_PUBLIC_FUNCTIONS_BASE || '';
process.env.EXPO_PUBLIC_PUBLIC_ALERT_API_KEY = process.env.EXPO_PUBLIC_PUBLIC_ALERT_API_KEY || '';

// fetch global si absent (Jest 29+ l’a mais on sécurise)
if (typeof global.fetch !== 'function') {
  global.fetch = jest.fn();
}
