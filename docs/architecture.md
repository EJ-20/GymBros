# Architecture Documentation

## Monorepo Structure

GymBros uses a pnpm workspace monorepo structure:

```
├── apps/          # Applications (web, mobile, api)
├── packages/      # Shared packages
├── scripts/       # Utility scripts
└── docs/          # Documentation
```

## Applications

### Web (`apps/web`)
- React application built with Vite
- Dashboard-heavy interface
- Uses `@gymbros/api-client` for API calls

### Mobile (`apps/mobile`)
- React Native application using Expo
- Mobile-first workout tracking
- Shares API client with web app

### API (`apps/api`)
- Express.js backend
- Prisma ORM for database
- All analytics calculations live in `src/analytics/`

## Packages

### Types (`packages/types`)
- Shared TypeScript type definitions
- Used across all apps and packages

### API Client (`packages/api-client`)
- Typed API client
- Provides type-safe API calls

### Analytics Utils (`packages/analytics-utils`)
- Shared non-sensitive analytics helpers
- 1RM calculations, volume calculations, date utilities

### Config (`packages/config`)
- Shared configuration files
- ESLint, TypeScript, Tailwind configs

## Data Flow

1. **Frontend** (web/mobile) → `@gymbros/api-client` → **API**
2. **API** → Prisma → **Database**
3. **API** → `@gymbros/analytics-utils` → **Analytics calculations**
4. **API** → Response → **Frontend**

