import { useAuth } from '@/src/contexts/AuthContext';
import { WEIGHT_UNIT_STORAGE_KEY } from '@/src/lib/storageKeys';
import type { WeightUnit } from '@/src/lib/weightUnits';
import { patchProfileWeightUnit, pullProfile } from '@/src/sync/syncEngine';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type Ctx = {
  unit: WeightUnit;
  /** True after AsyncStorage (and profile when signed in) have been read. */
  hydrated: boolean;
  setWeightUnit: (next: WeightUnit) => Promise<void>;
  reloadFromCloud: () => Promise<void>;
};

const WeightUnitContext = createContext<Ctx | null>(null);

function normalizeUnit(v: unknown): WeightUnit {
  return v === 'lbs' ? 'lbs' : 'kg';
}

export function WeightUnitProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [unit, setUnitState] = useState<WeightUnit>('kg');
  const [hydrated, setHydrated] = useState(false);

  const hydrate = useCallback(async () => {
    let next: WeightUnit = 'kg';
    try {
      const local = await AsyncStorage.getItem(WEIGHT_UNIT_STORAGE_KEY);
      if (local === 'lbs' || local === 'kg') next = local;
      if (user) {
        const p = await pullProfile();
        if (p) next = p.weightUnit;
      }
    } catch {
      /* ignore */
    }
    setUnitState(next);
    try {
      await AsyncStorage.setItem(WEIGHT_UNIT_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await hydrate();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrate]);

  const setWeightUnit = useCallback(
    async (next: WeightUnit) => {
      const n = normalizeUnit(next);
      setUnitState(n);
      try {
        await AsyncStorage.setItem(WEIGHT_UNIT_STORAGE_KEY, n);
      } catch {
        /* ignore */
      }
      if (user) {
        const { error } = await patchProfileWeightUnit(n);
        if (error) console.warn('patchProfileWeightUnit', error);
      }
    },
    [user]
  );

  const reloadFromCloud = useCallback(async () => {
    await hydrate();
  }, [hydrate]);

  const value = useMemo(
    () => ({ unit, hydrated, setWeightUnit, reloadFromCloud }),
    [unit, hydrated, setWeightUnit, reloadFromCloud]
  );

  return <WeightUnitContext.Provider value={value}>{children}</WeightUnitContext.Provider>;
}

export function useWeightUnit(): Ctx {
  const ctx = useContext(WeightUnitContext);
  if (!ctx) throw new Error('useWeightUnit must be used within WeightUnitProvider');
  return ctx;
}
