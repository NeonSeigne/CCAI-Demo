/**
 * The student's start place (`/api/me/campus-origin`), the shared setting walk
 * minutes are measured from. The shell loads it once (StartPlaceProvider);
 * Home, Events, Map and Saved read it with `useStartPlace()`. Outside the
 * provider (a page rendered on its own in a test) the hook loads it itself.
 */
import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { getCampusOrigin, setCampusOrigin } from '../../api/campus';
import { useAuth } from '../../contexts/AuthContext';

const StartPlaceContext = createContext(null);

const LOADING = { status: 'loading', place: null };
const SIGNED_OUT = { status: 'ready', place: null };

function useAuthToken() {
  try {
    return useAuth()?.authToken || null;
  } catch {
    return null;
  }
}

/**
 * {status: 'loading'|'ready'|'error', place, id, save(place), reload()}.
 * `save` stores a new start (PUT) and resolves to the stored place; it rejects
 * when the save fails, leaving the old start in place.
 */
function useStartPlaceState(authToken) {
  const [state, setState] = useState(authToken ? LOADING : SIGNED_OUT);
  const [version, setVersion] = useState(0);
  const tokenRef = useRef(authToken);
  tokenRef.current = authToken;

  useEffect(() => {
    if (!authToken) {
      setState(SIGNED_OUT);
      return undefined;
    }
    let cancelled = false;
    setState(LOADING);
    Promise.resolve()
      .then(() => getCampusOrigin(authToken))
      .then((data) => { if (!cancelled) setState({ status: 'ready', place: data?.place || null }); })
      .catch(() => { if (!cancelled) setState({ status: 'error', place: null }); });
    return () => { cancelled = true; };
  }, [authToken, version]);

  const save = useCallback(async (place) => {
    const data = await setCampusOrigin(tokenRef.current, place.id);
    const stored = data?.place || place;
    setState({ status: 'ready', place: stored });
    return stored;
  }, []);

  /** Sets the start without saving it (the server already has it). */
  const put = useCallback((place) => setState({ status: 'ready', place: place || null }), []);

  const reload = useCallback(() => setVersion((n) => n + 1), []);

  return useMemo(() => ({
    ...state, id: state.place?.id || null, save, put, reload,
  }), [state, save, put, reload]);
}

export function StartPlaceProvider({ children }) {
  const value = useStartPlaceState(useAuthToken());
  return <StartPlaceContext.Provider value={value}>{children}</StartPlaceContext.Provider>;
}

/** The shell's start place, or one loaded by this caller outside the provider. */
export function useStartPlace() {
  const shared = useContext(StartPlaceContext);
  const token = useAuthToken();
  const own = useStartPlaceState(shared ? null : token);
  return shared || own;
}
