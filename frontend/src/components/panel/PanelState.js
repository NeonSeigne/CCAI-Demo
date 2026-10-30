import React from 'react';
import { Icon } from '../icons';
import './PanelState.css';

/**
 * A panel's loading, empty or error state (DESIGN.md "States", design Q4):
 *
 *   loading  the panel's real layout drawn in raised: pass that layout as
 *            `children` (its blocks use `pnl-block`), or get `rows` plain rows
 *   empty    "Nothing listed today" (or `message`) with an icon
 *   error    ink text with an icon and Retry (when `onRetry` is given); never red alone
 *
 * Props: status ('loading' | 'empty' | 'error'), message, icon, onRetry,
 * rows (loading without children), label (what is loading, for screen readers).
 */
export default function PanelState({
  status, message, icon, onRetry, rows = 3, label = 'Loading', children,
}) {
  if (status === 'loading') {
    return (
      <div className="pnl-state pnl-loading" role="status" aria-busy="true">
        <span className="sr-only">{label}</span>
        <div aria-hidden="true">
          {children || Array.from({ length: rows }, (_, i) => <span key={i} className="pnl-block pnl-row" />)}
        </div>
      </div>
    );
  }
  if (status === 'empty') {
    return (
      <p className="pnl-state pnl-empty" role="status">
        <Icon name={icon || 'event_busy'} size={20} />
        {message || 'Nothing listed today'}
      </p>
    );
  }
  if (status === 'error') {
    return (
      <div className="pnl-state pnl-error" role="alert">
        <Icon name={icon || 'error'} size={20} />
        <span>{message || 'Couldn’t load'}</span>
        {onRetry && (
          <button type="button" className="pnl-retry" onClick={onRetry}>
            <Icon name="refresh" size={18} /> Retry
          </button>
        )}
      </div>
    );
  }
  return null;
}
