import React, { useEffect, useRef, useState } from 'react';
import { usePlanner } from '../../contexts/PlannerContext';
import {
  changedRowKeys, hasProblem, literalOps, proposalRows,
} from '../planner/proposalDiff';
import useAcceptProposal from '../planner/useAcceptProposal';
import ContextLink from '../ContextLink';
import { Icon } from '../icons';
import '../../styles/CourseVisuals.css';

/**
 * Chat card for a `proposed_change` visual (design 2A, 6A, 11A; chat-prereq, Q8, R10).
 *
 * visual: {type: 'proposed_change', proposal: {id, status, ops, diff, expires_at}}
 * (a bare proposal with `id` and `diff` is accepted too; `status: 'checking'`
 * or a missing diff shows the Checking state).
 *
 * Apply and Not now go through the shared PlannerContext, so the card and
 * the plan views always show the same outcome. Outside a PlannerProvider the
 * card shows the proposal without buttons.
 */

const MUTED = {
  discarded: 'Discarded',
  replaced: 'Replaced by a newer suggestion',
  expired: 'Expired · ask again for a fresh suggestion',
  undone: 'Undone',
};

/** Where "My degree" lives (Courses, degree view). */
const DEGREE_LINK = '/courses?view=degree';

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

/** The card's state from the visual, the shared outcome and the planner's view. */
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

/** One row: icon, label (a course reads "<code> Title"), then before → after or a value. */
function Row({ row, changed }) {
  return (
    <li className={`pc-row is-${row.kind}${changed ? ' is-changed' : ''}`}>
      <span className={`vc-diff-icon is-${row.kind}`}><Icon name={row.icon} size={18} /></span>
      <span className="vc-diff-label">
        {row.code ? (
          <>
            <span className="vc-code">{row.code}</span>
            {row.title ? ` ${row.title}` : ''}
          </>
        ) : row.label}
        {row.note && <small className="vc-diff-note">{row.note}</small>}
        {changed && <small className="pc-changed-tag"> · Changed</small>}
      </span>
      {row.before !== undefined || row.after !== undefined ? (
        <span className="vc-arrow">
          <s>{row.before}</s>
          <Icon name="arrow_forward" size={18} />
          <span className="sr-only"> changes to </span>
          {row.after}
        </span>
      ) : row.value != null && <b className="vc-diff-value">{row.value}</b>}
    </li>
  );
}

function Rows({ rows, changed }) {
  if (!rows.length) return null;
  return (
    <ul className="vc-diff">
      {rows.map((row) => <Row key={row.key} row={row} changed={changed.has(row.key)} />)}
    </ul>
  );
}

function Head({ tag }) {
  return (
    <div className="vc-head">
      <Icon name="edit_calendar" size={20} />
      <h3>Proposed change</h3>
      {tag}
    </div>
  );
}

/** A failure in ink with an icon, and Retry when there is something to retry. */
function Failure({ text, onRetry }) {
  return (
    <p className="vc-alert" role="alert">
      <Icon name="error" size={20} />
      <span>{text}</span>
      {onRetry && (
        <>
          <span aria-hidden="true">·</span>
          <button type="button" className="vc-link" onClick={onRetry}>Retry</button>
        </>
      )}
    </p>
  );
}

const NO_CHANGES = new Set();

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
    : NO_CHANGES;

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

  const rows = proposalRows(diff);

  if (state === 'applied') {
    const latest = outcome?.revision != null && planner?.view?.plan?.revision === outcome.revision && planner?.view?.undo_label;
    return (
      <div className="vc-card vc-proposal is-applied">
        <Head tag={<span className="vc-tag is-done">Applied</span>} />
        <div className="vc-body"><Rows rows={rows} changed={NO_CHANGES} /></div>
        <div className="vc-foot">
          {latest && (
            <button
              type="button"
              className="vc-btn"
              onClick={() => planner.undo()
                .then(() => setUndone(true))
                .catch(() => setLocalError("Couldn't undo"))}
            >
              <Icon name="undo" size={20} />
              Undo
            </button>
          )}
          <ContextLink className="vc-btn" to={DEGREE_LINK}>My degree</ContextLink>
        </div>
        {localError && <div className="vc-body"><Failure text={localError} /></div>}
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

  const applying = state === 'applying';
  const discarding = outcome?.status === 'discarding';
  const held = !!outcome?.held;
  const busy = applying || discarding || literalBusy;
  const canAct = !!planner && state !== 'refused';
  // A direct edit landed after this proposal was made: Not now only (D9).
  const stale = !!planner?.pendingProposal?.stale && planner.pendingProposal.id === reviewed?.id;
  // A problem row (Not met, Clashes) turns Apply secondary (Q8).
  const demoted = hasProblem(rows);
  const apply = () => {
    setLocalError(null);
    acceptProposal(reviewed);
  };

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
      <Head tag={<span className="vc-tag is-now">Not applied</span>} />
      <div className="vc-body">
        <Rows rows={rows} changed={changed} />
        {state === 'needs_review' && <p className="vc-alert is-review">Your plan changed, check again</p>}
        {state === 'refused' && <Failure text={outcome?.reason || "This change can't be applied."} />}
        {outcome?.error && state !== 'refused' && !held && (
          <Failure text={outcome.error} onRetry={canAct && !stale ? apply : undefined} />
        )}
        {localError && state !== 'refused' && <Failure text={localError} />}
        {held && <Failure text="Couldn't save" onRetry={planner.retry} />}
      </div>
      {canAct && (
        <div className="vc-foot">
          {!stale && (
            <button
              type="button"
              className={`vc-btn${demoted ? '' : ' is-primary'}`}
              disabled={busy || held}
              onClick={apply}
            >
              {applying ? <span className="vc-spinner" aria-hidden="true" /> : <Icon name="check" size={20} />}
              {applying ? 'Applying…' : 'Apply'}
            </button>
          )}
          {(state !== 'needs_review' || stale) && (
            <button type="button" className="vc-btn" disabled={busy} onClick={() => planner.discard(reviewed)}>
              Not now
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
