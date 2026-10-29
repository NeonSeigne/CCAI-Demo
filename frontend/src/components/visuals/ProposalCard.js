import React, { useEffect, useRef, useState } from 'react';
import { usePlanner } from '../../contexts/PlannerContext';
import { changedRowKeys, consequenceRows, literalOps } from '../planner/proposalDiff';
import useAcceptProposal from '../planner/useAcceptProposal';
import { Icon } from '../icons';
import '../../styles/CourseVisuals.css';

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

function RowIcon({ row, lead }) {
  if (lead) return <span className="vc-diff-icon is-move"><Icon name="swap_horiz" size={18} /></span>;
  if (row.key === 'credits') return <span className="vc-diff-icon"><Icon name="functions" size={18} /></span>;
  if (row.key === 'difficulty') return <span className="vc-diff-icon"><Icon name="bar_chart" size={18} /></span>;
  if (row.key === 'clashes') return <span className="vc-diff-icon"><Icon name="warning" size={18} /></span>;
  return <span className="vc-diff-icon"><Icon name="school" size={18} /></span>;
}

/** One consequence: icon, label, before → after. The first (biggest) leads. */
function Row({ row, changed, lead = false }) {
  return (
    <li className={`${lead ? 'pc-lead' : 'pc-row'}${changed ? ' is-changed' : ''}`}>
      <RowIcon row={row} lead={lead} />
      <span className="vc-diff-label">
        {row.label}
        {lead && row.suffix && <small> · {row.suffix}</small>}
        {changed && <small className="pc-changed-tag"> · Changed</small>}
      </span>
      <span className="vc-arrow">
        <s>{row.before}</s>
        <Icon name="arrow_forward" size={18} />
        <span className="sr-only"> changes to </span>
        {row.after}
      </span>
    </li>
  );
}

function Head() {
  return (
    <div className="vc-head">
      <Icon name="edit_calendar" size={20} />
      <h3>Proposed change</h3>
    </div>
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
  const acceptProposal = useAcceptProposal();

  // Once per card: the planner object changes with every view and status, and
  // a failed load would otherwise retry on each change.
  const plannerRef = useRef(planner);
  plannerRef.current = planner;
  useEffect(() => { plannerRef.current?.ensureLoaded(); }, []);

  const state = stateOf(visual || {}, original, outcome, planner);
  const reviewed = state === 'needs_review' ? (outcome?.proposal || original) : original;
  const diff = reviewed?.diff;
  const changed = state === 'needs_review' && outcome?.proposal
    ? changedRowKeys(original?.diff, outcome.proposal.diff)
    : new Set();

  if (state === 'checking') {
    return (
      <div className="vc-card vc-proposal" aria-busy="true">
        <Head />
        <p className="vc-line is-muted">Checking your plan…</p>
        <div className="vc-skeleton">
          {[0, 1, 2].map((i) => <i key={i} />)}
        </div>
      </div>
    );
  }

  if (state === 'applied' && undone) {
    return <div className="vc-card vc-proposal"><p className="vc-line is-muted">{MUTED.undone}</p></div>;
  }

  if (state === 'applied') {
    const latest = outcome?.revision != null && planner?.view?.plan?.revision === outcome.revision && planner?.view?.undo_label;
    return (
      <div className="vc-card vc-proposal">
        <p className="vc-line">
          <Icon name="check_circle" size={20} />
          Applied
          {latest && (
            <>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                className="vc-link"
                onClick={() => planner.undo()
                  .then(() => setUndone(true))
                  .catch(() => setLocalError("Couldn't undo"))}
              >
                Undo
              </button>
            </>
          )}
        </p>
        {localError && <p className="vc-alert vc-line" role="alert">{localError}</p>}
      </div>
    );
  }

  if (MUTED[state]) {
    return (
      <div className="vc-card vc-proposal">
        <p className="vc-line is-muted">{MUTED[state]}</p>
        {replacement && <div className="vc-chosen"><ProposalCard visual={{ type: 'proposed_change', proposal: replacement }} /></div>}
      </div>
    );
  }

  const rows = consequenceRows(diff);
  const [lead, ...rest] = rows;
  const applying = state === 'applying';
  const discarding = outcome?.status === 'discarding';
  const held = !!outcome?.held;
  const busy = applying || discarding || literalBusy;
  const canAct = !!planner && state !== 'refused';
  // A direct edit landed after this proposal was made: Discard only (D9).
  const stale = !!planner?.pendingProposal?.stale && planner.pendingProposal.id === reviewed?.id;

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
    <div className="vc-card vc-proposal" aria-busy={busy || undefined}>
      <Head />
      <div className="vc-body">
        <h4 className="vc-proposal-title">{diff?.heading || 'Change to your plan'}</h4>
        {diff?.literal_differs && <p className="vc-proposal-note">{diff.literal_differs}</p>}
        {rows.length > 0 && (
          <ul className="vc-diff">
            {lead && <Row row={lead} lead changed={false} />}
            {rest.map((row) => <Row key={row.key} row={row} changed={changed.has(row.key)} />)}
          </ul>
        )}
        {changed.has(lead?.key) && <p className="vc-alert is-review pc-changed-tag">The first line changed too.</p>}
        {(diff?.unknowns || []).length > 0 && (
          <ul className="vc-unknowns">
            {diff.unknowns.map((text) => <li key={text}>? {text}</li>)}
          </ul>
        )}
        {state === 'needs_review' && <p className="vc-alert is-review">Your plan changed, check again</p>}
        {state === 'refused' && (
          <p className="vc-alert" role="alert">{outcome?.reason || "This change can't be applied."}</p>
        )}
        {(outcome?.error || localError) && state !== 'refused' && (
          <p className="vc-alert" role="alert">{outcome?.error || localError}</p>
        )}
        {held && (
          <p className="vc-alert" role="alert">
            Couldn't save <span aria-hidden="true">·</span>
            {' '}
            <button type="button" className="vc-link" onClick={planner.retry}>Retry</button>
          </p>
        )}
      </div>
      {canAct && (
        <div className="vc-foot">
          {!stale && (
            <button
              type="button"
              className="vc-btn is-primary"
              disabled={busy || held}
              onClick={() => acceptProposal(reviewed)}
            >
              {applying ? <span className="vc-spinner" aria-hidden="true" /> : <Icon name="check" size={20} />}
              {applying ? 'Applying…' : 'Accept'}
            </button>
          )}
          {(state !== 'needs_review' || stale) && (
            <button type="button" className="vc-btn" disabled={busy} onClick={() => planner.discard(reviewed)}>
              Discard
            </button>
          )}
          {diff?.literal_differs && state !== 'needs_review' && !stale && (
            <button type="button" className="vc-btn" disabled={busy} onClick={dropInstead}>
              Drop it instead
            </button>
          )}
        </div>
      )}
    </div>
  );
}
