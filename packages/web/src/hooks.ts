import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createApiClient } from './api/client.js';
import { useEdAuth } from './auth/AuthProvider.js';

export function useApi() {
  const auth = useEdAuth();
  return useMemo(() => createApiClient(auth.getAccessToken), [auth]);
}

export function useDepartments(api: ReturnType<typeof createApiClient>) {
  return useQuery({ queryKey: ['departments'], queryFn: api.departments });
}

/** Debounce a rapidly-changing value so keystrokes don't fire a query each. */
export function useDebounced<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(handle);
  }, [value, delayMs]);
  return debounced;
}
