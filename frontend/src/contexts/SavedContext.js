import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { createSaved, deleteSaved, listSaved } from '../api/campus';

/**
 * The signed-in student's saved courses, events and places (design 12A),
 * loaded once from GET /api/saved and kept in step by optimistic save and
 * unsave, so every Save button and the rail's Saved count agree.
 */
export const SavedContext = createContext(null);

const keyOf = (kind, key) => `${kind}:${key}`;

export function SavedProvider({ children }) {
  const { authToken } = useAuth();
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('idle');
  const itemsRef = useRef(items);
  // Saves still in flight, so an unsave right after one can wait for its server id.
  const pending = useRef(new Map());
  const tokenRef = useRef(authToken);
  tokenRef.current = authToken;

  const commit = useCallback((update) => {
    itemsRef.current = update(itemsRef.current);
    setItems(itemsRef.current);
  }, []);

  const load = useCallback(() => {
    if (!authToken) {
      itemsRef.current = [];
      pending.current.clear();
      setItems([]);
      setStatus('idle');
      return undefined;
    }
    let cancelled = false;
    setStatus('loading');
    listSaved(authToken)
      .then((list) => {
        if (cancelled) return;
        itemsRef.current = list;
        setItems(list);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => { cancelled = true; };
  }, [authToken]);

  useEffect(() => load(), [load]);

  const find = (kind, key) => itemsRef.current.find((item) => item.kind === kind && item.key === key);

  const isSaved = useCallback(
    (kind, key) => items.some((item) => item.kind === kind && item.key === key),
    [items],
  );

  /**
   * save({kind, key, display_name, event_start?, event_end?, collection_id?}):
   * shows as saved at once, reverts and rethrows if the request fails.
   * Resolves to the stored item.
   */
  const save = useCallback(async (item) => {
    const id = keyOf(item.kind, item.key);
    if (pending.current.has(id)) return pending.current.get(id);
    const existing = find(item.kind, item.key);
    if (existing) return existing;

    const draft = { collection_id: null, ...item };
    commit((current) => [...current, draft]);
    const body = {
      kind: item.kind,
      key: item.key,
      display_name: item.display_name,
      ...(item.event_start ? { event_start: item.event_start } : {}),
      ...(item.event_end ? { event_end: item.event_end } : {}),
      ...(item.collection_id ? { collection_id: item.collection_id } : {}),
    };
    const request = createSaved(tokenRef.current, body)
      .then((stored) => {
        const merged = { ...draft, ...(stored && typeof stored === 'object' ? stored : {}) };
        commit((current) => current.map((entry) => (entry === draft ? merged : entry)));
        return merged;
      })
      .catch((error) => {
        commit((current) => current.filter((entry) => entry !== draft));
        throw error;
      })
      .finally(() => pending.current.delete(id));
    pending.current.set(id, request);
    return request;
  }, [commit]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * unsave(kind, key): removes at once, restores and rethrows if the request
   * fails. Resolves to the removed item (without its server id) for Undo, or
   * null when nothing was saved.
   */
  const unsave = useCallback(async (kind, key) => {
    const id = keyOf(kind, key);
    let item = find(kind, key);
    if (!item) return null;
    commit((current) => current.filter((entry) => entry !== item));
    if (pending.current.has(id)) {
      try {
        item = await pending.current.get(id);
      } catch {
        return null; // that save failed, so there is nothing to delete
      }
      // The save's success re-added it; take it out again.
      commit((current) => current.filter((entry) => !(entry.kind === kind && entry.key === key)));
    }
    try {
      if (item.id != null) {
        await deleteSaved(tokenRef.current, item.id).catch((error) => {
          if (error?.status !== 404) throw error; // already gone counts as removed
        });
      }
    } catch (error) {
      commit((current) => (current.some((entry) => entry.kind === kind && entry.key === key)
        ? current
        : [...current, item]));
      throw error;
    }
    const { id: _serverId, ...rest } = item;
    return rest;
  }, [commit]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo(() => ({
    items, status, count: items.length, isSaved, save, unsave, reload: load,
  }), [items, status, isSaved, save, unsave, load]);

  return <SavedContext.Provider value={value}>{children}</SavedContext.Provider>;
}

/** The saved state, or null outside a SavedProvider (Save buttons then hide). */
export function useSaved() {
  return useContext(SavedContext);
}

export default SavedContext;
