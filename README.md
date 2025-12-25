# GymBros

A comprehensive fitness tracking and analytics platform built with a monorepo architecture.

## Structure

- **apps/web** - React web application (dashboard-heavy)
- **apps/mobile** - React Native mobile app (Expo)
- **apps/api** - Backend API (Node.js + Express)
- **packages/types** - Shared TypeScript types
- **packages/api-client** - Typed API client
- **packages/analytics-utils** - Shared analytics utilities
- **packages/config** - Shared configuration files

## Getting Started

```bash
# Install dependencies
pnpm install

# Run all apps in development
pnpm dev

# Build all packages
pnpm build
```

## Tech Stack

- **Frontend**: React, Vite
- **Mobile**: React Native, Expo
- **Backend**: Node.js, Express
- **Database**: Prisma ORM
- **Package Manager**: pnpm
- **Monorepo**: pnpm workspaces

