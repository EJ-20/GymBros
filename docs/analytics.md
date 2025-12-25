# Analytics Documentation

## Overview

Analytics calculations are performed server-side in the `apps/api/src/analytics/` directory.

## Calculations

### One-Rep Max (1RM)

The API uses the Epley formula to estimate 1RM:
```
1RM = weight × (1 + reps/30)
```

Alternative formulas (Brzycki) are available in `@gymbros/analytics-utils`.

### Volume

Volume is calculated as:
```
Volume = weight × reps
```

Total volume sums all sets in a workout or exercise.

## Strength Standards

Strength standards are categorized as:
- Untrained
- Novice
- Intermediate
- Advanced
- Elite

Standards are exercise-specific and can be seeded using the `scripts/seed.ts` script.

