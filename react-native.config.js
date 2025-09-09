// react-native.config.js (à la racine du projet)
module.exports = {
  dependencies: {
    '@notifee/react-native': {
      platforms: {
        android: null, // désactive Notifee côté Android
      },
    },
  },
};
