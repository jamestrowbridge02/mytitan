import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch, getToken } from './api';

type WorkspaceEntitlements = {
  planCode: string;
  features: Record<string, any>;
};

type EntitlementsState = {
  planCode: string | null;
  features: Record<string, any>;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
};

const defaultFeatures: Record<string, any> = {
  bookings_enabled: false,
  accounting_enabled: false,
  payments_enabled: false,
  social_enabled: false,
  ai_enabled: false,
};

const EntitlementsContext = createContext<EntitlementsState | undefined>(undefined);

export function EntitlementsProvider({ children }: { children: React.ReactNode }) {
  const [entitlements, setEntitlements] = useState<WorkspaceEntitlements | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    if (!getToken()) {
      setEntitlements(null);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch('/me/entitlements');
      setEntitlements({
        planCode: typeof data?.planCode === 'string' ? data.planCode : 'SOLE_TRADER',
        features: { ...defaultFeatures, ...(data?.features ?? {}) },
      });
    } catch (err: any) {
      setError(err.message || 'Failed to load entitlements');
      setEntitlements(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const value = useMemo(
    () => ({
      planCode: entitlements?.planCode ?? null,
      features: entitlements?.features ?? defaultFeatures,
      loading,
      error,
      refresh,
    }),
    [entitlements?.planCode, entitlements?.features, loading, error],
  );

  return <EntitlementsContext.Provider value={value}>{children}</EntitlementsContext.Provider>;
}

export function useEntitlements() {
  const context = useContext(EntitlementsContext);
  if (!context) {
    throw new Error('useEntitlements must be used inside EntitlementsProvider');
  }
  return context;
}
