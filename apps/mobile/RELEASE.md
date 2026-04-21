# GymBros mobile release guide (iOS + Android)

This project uses Expo SDK 54 and EAS Build/Submit for app-store releases.

## 1) One-time setup

From repo root:

```bash
npm install
```

From `apps/mobile`:

```bash
npx eas login
npx eas whoami
```

If this is your first EAS setup for the project:

```bash
npx eas init
```

## 2) Configure environment variables

Create `apps/mobile/.env.production` (do not commit):

```bash
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

If you are using EAS Secrets instead of local env files, set them once:

```bash
npx eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value https://YOUR_PROJECT.supabase.co
npx eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value your_anon_key
```

## 3) Set identifiers and release metadata

`app.config.js` supports env-driven release values:

- `IOS_BUNDLE_IDENTIFIER` (default: `com.gymbros.app`)
- `ANDROID_PACKAGE` (default: `com.gymbros.app`)
- `APP_VERSION` (default: `1.0.0`)
- `IOS_BUILD_NUMBER` (default: `1`)
- `ANDROID_VERSION_CODE` (default: `1`)

Before each store release, increment:

- `APP_VERSION` for customer-visible version (e.g. `1.0.1`)
- `IOS_BUILD_NUMBER` (string integer: `2`, `3`, …)
- `ANDROID_VERSION_CODE` (integer: `2`, `3`, …)

## 4) Build production artifacts

From `apps/mobile`:

```bash
npx eas build --platform ios --profile production
npx eas build --platform android --profile production
```

Tip: use `--local` only if you intentionally want local native builds.

## 5) Submit to stores

### iOS (App Store Connect)

```bash
npx eas submit --platform ios --profile production
```

You will need:

- Apple Developer account access
- App Store Connect app record for your bundle id
- Distribution certificates/provisioning (EAS can manage these)

### Android (Google Play)

```bash
npx eas submit --platform android --profile production
```

You will need:

- Google Play Console app for your package id
- Service account JSON configured for EAS Submit (or manual upload)

## 6) Optional internal testing builds

Create preview builds for QA before production submission:

```bash
npx eas build --platform ios --profile preview
npx eas build --platform android --profile preview
```

## 7) OTA updates (optional, recommended)

If you want JS-only hot updates post-release:

```bash
npx eas update:configure
npx eas update --branch production --message "fix: <summary>"
```

Use OTA updates only for changes that do not require native code/config updates.

## 8) Release checklist

- [ ] `supabase db push` and `supabase functions deploy ai-coach` already applied for backend changes
- [ ] Env vars present for production (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`)
- [ ] `APP_VERSION`, `IOS_BUILD_NUMBER`, `ANDROID_VERSION_CODE` bumped
- [ ] `npx eas build --platform ios --profile production` succeeds
- [ ] `npx eas build --platform android --profile production` succeeds
- [ ] Store screenshots, descriptions, privacy labels/forms updated
- [ ] Submit builds with `eas submit`
