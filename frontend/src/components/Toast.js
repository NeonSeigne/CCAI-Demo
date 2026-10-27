import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import ContextLink from './ContextLink';
import '../styles/Toast.css';

/**
 * One short message at a time at the bottom of the screen ("Saved to Unsorted
 * · Move · Undo"), in a polite live region. It stays 5 s, and holds while
 * hovered or focused so its actions stay reachable.
 */
const ToastContext = createContext(null);
const DEFAULT_DURATION = 5000;
const noop = () => {};

export function Toast({ toast, onDismiss, onHold, onRelease }) {
  return (
    <div className="cc-toast-region" role="status" aria-live="polite">
      {toast && (
        <div
          className={`cc-toast ${toast.tone === 'error' ? 'is-error' : ''}`}
          onMouseEnter={onHold}
          onMouseLeave={onRelease}
          onFocus={onHold}
          onBlur={onRelease}
        >
          <span>{toast.message}</span>
          {(toast.actions || []).map((action) => (action.to ? (
            <ContextLink key={action.label} className="cc-toast-action" to={action.to} onClick={() => onDismiss?.()}>
              {action.label}
            </ContextLink>
          ) : (
            <button
              key={action.label}
              type="button"
              className="cc-toast-action"
              onClick={() => {
                onDismiss?.();
                action.onClick?.();
              }}
            >
              {action.label}
            </button>
          )))}
        </div>
      )}
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const current = useRef(null);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const dismiss = useCallback(() => {
    clear();
    current.current = null;
    setToast(null);
  }, [clear]);

  const arm = useCallback((duration) => {
    clear();
    timer.current = setTimeout(dismiss, duration);
  }, [clear, dismiss]);

  /** show({message, actions: [{label, onClick} | {label, to}], tone: 'error'?, duration?}) */
  const show = useCallback((next) => {
    const entry = { duration: DEFAULT_DURATION, ...next };
    current.current = entry;
    setToast(entry);
    arm(entry.duration);
  }, [arm]);

  useEffect(() => clear, [clear]);

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toast
        toast={toast}
        onDismiss={dismiss}
        onHold={clear}
        onRelease={() => current.current && arm(current.current.duration)}
      />
    </ToastContext.Provider>
  );
}

/** {show, dismiss}; no-ops outside a ToastProvider. */
export function useToast() {
  return useContext(ToastContext) || { show: noop, dismiss: noop };
}

export default Toast;
