import type { Session, User } from '@supabase/supabase-js';
import { resetLocalDatabase } from '@/src/db/resetLocalDatabase';
import { SIGN_IN_PROMPT_DISMISS_KEY } from '@/src/lib/storageKeys';
import { getSupabase, supabaseConfigured } from '@/src/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type SignUpResult = {
  error: Error | null;
  /** Present when Supabase logs you in immediately (email confirmation disabled or dev). */
  session: Session | null;
};

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** Increments after sign-out clears local DB; use to refresh screens that read SQLite. */
  localDataVersion: number;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  /** Optional `fullName` is stored on the auth user as `full_name` (user metadata). */
  signUp: (
    email: string,
    password: string,
    options?: { fullName?: string }
  ) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  backendReady: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [localDataVersion, setLocalDataVersion] = useState(0);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      setLoading(false);
      return;
    }
    sb.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
    });
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const sb = getSupabase();
    if (!sb) return { error: new Error('Supabase not configured') };
    const { error } = await sb.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, options?: { fullName?: string }) => {
      const sb = getSupabase();
      if (!sb) return { error: new Error('Supabase not configured'), session: null };
      const name = options?.fullName?.trim();
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options:
          name && name.length > 0
            ? { data: { full_name: name } }
            : undefined,
      });
      if (error) return { error: error as Error, session: null };
      return { error: null, session: data.session ?? null };
    },
    []
  );

  const signOut = useCallback(async () => {
    const sb = getSupabase();
    if (sb) await sb.auth.signOut();
    try {
      resetLocalDatabase();
    } catch (e) {
      console.error('resetLocalDatabase after sign out', e);
    }
    try {
      await AsyncStorage.removeItem(SIGN_IN_PROMPT_DISMISS_KEY);
    } catch {
      /* ignore */
    }
    setLocalDataVersion((v) => v + 1);
  }, []);

  const value: AuthContextValue = {
    user: session?.user ?? null,
    session,
    loading,
    localDataVersion,
    signIn,
    signUp,
    signOut,
    backendReady: supabaseConfigured,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
