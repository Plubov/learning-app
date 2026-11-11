import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

type QueryResult<T> = { data: T | null; error: { message: string } | null };

type QueryState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
};

/**
 * Runs a Supabase query whenever the screen comes into view, so returning
 * from an edit screen shows fresh data. `load` must be wrapped in useCallback
 * by the caller, otherwise it would rerun on every render.
 */
export function useFocusQuery<T>(load: () => PromiseLike<QueryResult<T>>): QueryState<T> {
  const [state, setState] = useState<QueryState<T>>({ data: null, error: null, loading: true });

  useFocusEffect(
    useCallback(() => {
      let active = true; // ignore results that arrive after leaving the screen
      load().then(({ data, error }) => {
        if (active) {
          setState({ data, error: error?.message ?? null, loading: false });
        }
      });
      return () => {
        active = false;
      };
    }, [load]),
  );

  return state;
}
