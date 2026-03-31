/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  expo: {
    name: 'GymBros',
    slug: 'gymbros',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'gymbros',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.gymbros.app',
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/images/adaptive-icon.png',
        backgroundColor: '#0f1419',
      },
      package: 'com.gymbros.app',
    },
    web: {
      bundler: 'metro',
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: ['expo-router', 'expo-sqlite'],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
      supabaseAnonKey:
        process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
        process.env.EXPO_PUBLIC_SUPABASE_KEY ??
        '',
    },
  },
};
