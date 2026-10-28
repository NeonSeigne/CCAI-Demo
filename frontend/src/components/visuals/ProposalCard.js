import React, { useEffect, useState } from 'react';
import { usePlanner } from '../../contexts/PlannerContext';
import { changedRowKeys, consequenceRows, literalOps } from '../planner/proposalDiff';
import '../../styles/PlanPanel.css';

/**
 * Chat card for a `proposed_change` visual (design 2A, 6A, 11A).
 *
 * visual: {type: 'proposed_change', proposal: {id, status, ops, diff, expires_at}}
 * (a bare proposal with `id` and `diff` is accepted too; `status: 'checking'`
 * or a missing diff shows the Checking state).
 *
 * Accept and Discard go through the shared PlannerContext, so the card and
 * the plan panel always show the same outcome. Outside a PlannerProvider the
 * card shows the proposal without buttons.
 */

const MUTED = {
  discarded: 'Discarded',
  replaced: 'Replaced by a newer suggestion',
  expired: 'Expired · ask again for a fresh suggestion',
  undone: 'Undone',
};

function proposalOf(visual) {
  if (!visual) return null;
  if (visual.proposal) return visual.proposal;
  return visual.id ? visual : null;
}

function isExpired(proposal) {
  if (!proposal?.expires_at) return false;
  const at = new Date(proposal.expires_at).getTime();
  return Number.isFinite(at) && at <= Date.now();
}

/** The card's state from the visual, the shared outcome and the panel's view. */
function stateOf(visual, proposal, outcome, planner) {
  if (!proposal || visual.status === 'checking' || !proposal.diff) return 'checking';
  if (outcome?.status) return outcome.status === 'discarding' ? 'ready' : outcome.status;
  const status = proposal.status || 'pending';
  if (status !== 'pending') return status;
  if (isExpired(proposal)) return 'expired';
  const current = planner?.status === 'ready' ? planner.view?.proposal : undefined;
  if (current && current.id !== proposal.id && (current.status || 'pending') === 'pending') return 'replaced';
  return 'ready';
}

function Row({ row, changed }) {
  return (
    <li className={`pc-row ${changed ? 'is-changed' : ''}`.trim()}>
      <span>
        {row.label}
        {changed && <span className="pc-changed-tag"> · Changed</span>}
      </span>
      <span className="pc-row-value">
        {row.before}
        <span aria-hidden="true"> → </span>
        <span className="sr-only"> changes to </span>
        {row.after}
      </span>
    </li>
  );
}

function Lead({ row }) {
  if (!row) return null;
  return (
    <p className="pc-lead">
      {row.label}: {row.before}
      <span aria-hidden="true"> → </span>
      <span className="sr-only"> changes to </span>
      {row.after}
      {row.suffix ? ` · ${row.suffix}` : ''}
    </p>
  );
}

export default function ProposalCard({ visual }) {
  const planner = usePlanner();
  const original = proposalOf(visual);
  const outcome = planner && original?.id ? planner.proposalState(original.id) : null;
  const [replacement, setReplacement] = useState(null);
  const [literalBusy, setLiteralBusy] = useState(false);
  const [localError, setLocalError] = useState(null);
  const [undone, setUndone] = useState(false);

  useEffect(() => { planner?.ensureLoaded(); }, [planner]);

  const state = stateOf(visual || {}, original, outcome, planner);
  const reviewed = state === 'needs_review' ? (outcome?.proposal || original) : original;
  const diff = reviewed?.diff;
  const changed = state === 'needs_review' && outcome?.proposal
    ? changedRowKeys(original?.diff, outcome.proposal.diff)
    : new Set();

  if (state === 'checking') {
    return (
      <div className="proposal-card" aria-busy="true">
        <p className="pc-label">Proposed change</p>
        <p className="pc-line">Checking your plan…</p>
        <div className="pp-skeleton">
          {[0, 1, 2].map((i) => <div key={i} className="pp-skel pp-skel-row" />)}
        </div>
      </div>
    );
  }

  if (state === 'applied' && undone) {
    return <div className="proposal-card"><p className="pc-line is-muted">{MUTED.undone}</p></div>;
  }

  if (state === 'applied') {
    const latest = outcome?.revision != null && planner?.view?.plan?.revision === outcome.revision && planner?.view?.undo_label;
    return (
      <div className="proposal-card">
        <p className="pc-line">
          Applied
          {latest && (
            <>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                className="pp-link"
                onClick={() => planner.undo()
                  .then(() => setUndone(true))
                  .catch(() => setLocalError("Couldn't undo"))}
              >
                Undo
              </button>
            </>
          )}
        </p>
        {localError && <p className="pc-refused" role="alert">{localError}</p>}
      </div>
    );
  }

  if (MUTED[state]) {
    return (
      <div className="proposal-card">
        <p className="pc-line is-muted">{MUTED[state]}</p>
        {replacement && <div className="sl-chosen"><ProposalCard visual={{ type: 'proposed_change', proposal: replacement }} /></div>}
      </div>
    );
  }

  const rows = consequenceRows(diff);
  const [lead, ...rest] = rows;
  const applying = state === 'applying';
  const discarding = outcome?.status === 'discarding';
  const busy = applying || discarding || literalBusy;
  const canAct = !!planner && state !== 'refused';

  const dropInstead = async () => {
    setLiteralBusy(true);
    setLocalError(null);
    try {
      setReplacement(await planner.propose(literalOps(reviewed)));
    } catch {
      setLocalError("Couldn't make that change. Try again.");
    } finally {
      setLiteralBusy(false);
    }
  };

  return (
    <div className="proposal-card" aria-busy={busy || undefined}>
      <p className="pc-label">Proposed change</p>
      <h3 className="pc-heading">{diff?.heading || 'Change to your plan'}</h3>
      {diff?.literal_differs && <p className="pc-literal">{diff.literal_differs}</p>}
      <Lead row={lead} />
      {rest.length > 0 && (
        <ul className="pc-rows">
          {rest.map((row) => <Row key={row.key} row={row} changed={changed.has(row.key)} />)}
        </ul>
      )}
      {changed.has(lead?.key) && <p className="pc-changed-tag">The first line changed too.</p>}
      {(diff?.unknowns || []).length > 0 && (
        <ul className="pc-unknowns">
          {diff.unknowns.map((text) => <li key={text}>? {text}</li>)}
        </ul>
      )}
      {state === 'needs_review' && <p className="pc-review">Your plan changed, check again</p>}
      {state === 'refused' && (
        <p className="pc-refused" role="alert">{outcome?.reason || "This change can't be applied."}</p>
      )}
      {(outcome?.error || localError) && state !== 'refused' && (
        <p className="pc-refused" role="alert">{outcome?.error || localError}</p>
      )}
      {canAct && (
        <div className="pc-actions">
          <button
            type="button"
            className="pp-btn is-primary"
            disabled={busy}
            onClick={() => planner.accept(reviewed)}
          >
            {applying && <span className="pc-spinner" aria-hidden="true" />}
            {applying ? 'Applying…' : 'Accept'}
          </button>
          {state !== 'needs_review' && (
            <button type="button" className="pp-btn" disabled={busy} onClick={() => planner.discard(reviewed)}>
              Discard
            </button>
          )}
          {diff?.literal_differs && state !== 'needs_review' && (
            <button type="button" className="pp-btn" disabled={busy} onClick={dropInstead}>
              Drop it instead
            </button>
          )}
        </div>
      )}
    </div>
  );
}
