---
description: Repository Information Overview
alwaysApply: true
---

# VigiApp Information

## Summary

VigiApp is a mobile application for neighborhood coordination, allowing users to report incidents, chat with neighbors, and coordinate help. It's built with React Native and Expo, using Firebase for backend services.

## Structure

- **app/**: Expo Router pages (tabs, alerts, auth, chats)
- **functions/**: Firebase Cloud Functions for backend services
- **services/**: API services for auth, groups, chat
- **hooks/**: Custom React hooks for app logic
- **components/**: Reusable UI components
- **store/**: Zustand state management
- **utils/**: Helper functions and utilities
- **android/**: Native Android project files

## Language & Runtime

**Language**: JavaScript/TypeScript
**Version**: Node.js 20.19.4+
**Build System**: Expo/Metro
**Package Manager**: Yarn 1.22.22

## Dependencies

**Main Dependencies**:

- expo 53.0.0
- react 19.0.0
- react-native 0.79.6
- expo-router 5.1.4
- firebase 12.0.0
- react-native-maps 1.20.1
- zustand 5.0.6

**Development Dependencies**:

- typescript 5.8.3
- jest 29.7.0
- eslint 9.25.0

## Build & Installation

```bash
# Install dependencies
yarn

# Start Expo development server
yarn start

# Run on Android with Expo Dev Client
yarn android
# or
expo run:android

# Build Android debug APK
cd android; .\gradlew.bat assembleDebug; cd ..
```

## Docker

No Docker configuration found in the repository.

## Testing

**Framework**: Jest 29.7.0
**Test Location**: `__tests__/`
**Configuration**: Jest Expo preset
**Run Command**:

```bash
yarn test
# or
yarn test:watch
```

## Firebase Functions

**Runtime**: Node.js 20
**Configuration**: Firebase Functions v6.4.0
**Main Functions**:

- sendPublicAlertByCEP: Send notifications to devices by postal code
- sendPrivateAlertByGroup: Send notifications to group members
- purgeAndArchiveOldRequestsAndChats: Scheduled cleanup function

**Deployment**:

```bash
cd functions
npm run deploy
```
