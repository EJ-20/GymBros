/** @type {import('expo/config').ExpoConfig} */
const APP_NAME = 'GymBros';
const APP_SLUG = 'gymbros';
const APP_SCHEME = 'gymbros';
const DEFAULT_BUNDLE_ID = 'com.gymbros.app';
const DEFAULT_ANDROID_PACKAGE = 'com.gymbros.app';

const appVersion = process.env.APP_VERSION ?? '1.0.0';
const iosBuildNumber = process.env.IOS_BUILD_NUMBER ?? '1';
const androidVersionCode = Number.parseInt(process.env.ANDROID_VERSION_CODE ?? '1', 10);
const bundleIdentifier = process.env.IOS_BUNDLE_IDENTIFIER ?? DEFAULT_BUNDLE_ID;
const androidPackage = process.env.ANDROID_PACKAGE ?? DEFAULT_ANDROID_PACKAGE;
const easProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? process.env.EAS_PROJECT_ID ?? null;

const updates = {
  fallbackToCacheTimeout: 0,
};
if (easProjectId) {
  updates.url = `https://u.expo.dev/${easProjectId}`;
}

module.exports = {
  expo: {
    name: APP_NAME,
    slug: APP_SLUG,
    scheme: APP_SCHEME,
    version: appVersion,
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    runtimeVersion: {
      policy: 'appVersion',
    },
    updates,
    ios: {
      supportsTablet: true,
      bundleIdentifier,
      buildNumber: iosBuildNumber,
    },
    android: {
      package: androidPackage,
      versionCode: Number.isFinite(androidVersionCode) ? androidVersionCode : 1,
      adaptiveIcon: {
        foregroundImage: './assets/images/adaptive-icon.png',
        backgroundColor: '#0f1419',
      },
      /** Resize the app when the keyboard opens so focused fields stay visible. */
      softwareKeyboardLayoutMode: 'resize',
    },
    web: {
      bundler: 'metro',
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      'expo-sqlite',
      [
        'expo-sensors',
        {
          motionPermission:
            'GymBros reads step counts from your phone and watch so activity matches your training.',
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      ...(easProjectId ? { eas: { projectId: easProjectId } } : {}),
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
      supabaseAnonKey:
        process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
        process.env.EXPO_PUBLIC_SUPABASE_KEY ??
        '',
    },
  },
};
