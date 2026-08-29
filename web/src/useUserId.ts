import { useCallback, useState } from "react";

const STORAGE_KEY = "pantrypal:userId";

function loadOrCreate(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, fresh);
    return fresh;
  } catch {
    // private mode / storage blocked — fall back to a session-only id
    return crypto.randomUUID();
  }
}

/**
 * A stable per-browser user id, persisted in localStorage and sent as the
 * `x-user-id` header. `reset` mints a fresh one — used by "forget me" so the
 * next messages belong to a brand-new identity.
 */
export function useUserId(): readonly [string, () => void] {
  const [userId, setUserId] = useState(loadOrCreate);

  const reset = useCallback(() => {
    const fresh = crypto.randomUUID();
    try {
      localStorage.setItem(STORAGE_KEY, fresh);
    } catch {
      /* ignore — session-only id */
    }
    setUserId(fresh);
  }, []);

  return [userId, reset] as const;
}
