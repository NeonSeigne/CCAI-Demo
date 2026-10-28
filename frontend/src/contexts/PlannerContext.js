import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import {
  acceptProposal,
  createProposal,
  discardProposal,
  getPlan,
  listPrograms,
  newIdempotencyKey,
  plannerError,
  postEdits,
  undoEdit,
} from '../api/planner';

/**
 * The signed-in student's semester plan, shared by the plan panel and the
 * chat's proposal and shortlist cards so they never disagree (design 6A).
 *
 * The plan loads on first use (`ensureLoaded`), not on every page. Proposal
 * outcomes are kept per proposal id: a card reads `proposalState(id)` and the
 * panel reads `view.proposal`, both written by the same accept/discard calls.
 * A 409 revision conflict refetches and raises the "Updated from another
 * window" notice (10A).
 */
export const PlannerContext = createContext(null);

/** "Undo: removed ECON 3010", read from the plan's undo stack. */
export function undoLabelOf(plan) {
  const undo = plan?.undo;
  if (!undo || !undo.pointer) return null;
  return undo.stack?.[undo.pointer - 1]?.label || null;
}

const isPending = (proposal) => !!proposal && (proposal.status || 'pending') === 'pending';

export function PlannerProvider({ children }) {
  const { authToken } = useAuth();
  const [view, setView] = useState(null);
  const [status, setStatus] = useState('idle');
  const [programs, setPrograms] = useState([]);
  const [notice, setNotice] = useState(null);
  const [outcomes, setOutcomes] = useState({});
  const [announcement, setAnnouncement] = useState('');
  // The proposal just applied, so its rows can turn from ghost to solid (13A).
  const [lastApplied, setLastApplied] = useState(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const statusRef = useRef(status);
  statusRef.current = status;
  const tokenRef = useRef(authToken);
  tokenRef.current = authToken;
  const loadingRef = useRef(null);
  const programsRef = useRef(false);

  const setOutcome = useCallback((id, outcome) => {
    if (!id) return;
    setOutcomes((current) => ({ ...current, [id]: { ...(current[id] || {}), ...outcome } }));
  }, []);

  const announce = useCallback((proposal) => {
    const heading = proposal?.diff?.heading;
    if (heading) setAnnouncement(`Proposed change ready: ${heading.charAt(0).toLowerCase()}${heading.slice(1)}`);
  }, []);

  /** Put a new view in place; a replaced pending proposal is marked as such. */
  const commitView = useCallback((next) => {
    const before = viewRef.current?.proposal;
    if (before && isPending(before) && before.id !== next?.proposal?.id && next?.proposal) {
      setOutcome(before.id, { status: 'replaced' });
    }
    viewRef.current = next;
    setView(next);
  }, [setOutcome]);

  const load = useCallback(async () => {
    if (!tokenRef.current) return null;
    if (loadingRef.current) return loadingRef.current;
    // Program names for the header and the first-visit chips, once.
    if (!programsRef.current) {
      programsRef.current = true;
      listPrograms(tokenRef.current)
        .then(setPrograms)
        .catch(() => { programsRef.current = false; });
    }
    setStatus((current) => (current === 'ready' ? current : 'loading'));
    const run = getPlan(tokenRef.current)
      .then((data) => {
        commitView({ ...data, undo_label: data.undo_label ?? undoLabelOf(data.plan) });
        setStatus('ready');
        return data;
      })
      .catch((error) => {
        if (statusRef.current !== 'ready') setStatus('error');
        throw error;
      })
      .finally(() => { loadingRef.current = null; });
    loadingRef.current = run;
    return run;
  }, [commitView]);

  const ensureLoaded = useCallback(() => {
    if (statusRef.current === 'idle' || statusRef.current === 'error') load().catch(() => {});
  }, [load]);

  // A different sign-in starts from nothing.
  const seenToken = useRef(authToken);
  useEffect(() => {
    if (seenToken.current === authToken) return;
    seenToken.current = authToken;
    viewRef.current = null;
    programsRef.current = false;
    setView(null);
    setStatus('idle');
    setPrograms([]);
    setOutcomes({});
  }, [authToken]);

  /** After a 409 revision conflict: refetch and say so once. */
  const recover = useCallback(async () => {
    setNotice('conflict');
    try {
      await load();
    } catch {
      // the panel keeps the last plan; its retry stays available
    }
  }, [load]);

  const revisionNow = useCallback(async () => {
    if (viewRef.current?.plan) return viewRef.current.plan.revision;
    const data = await load();
    return data?.plan?.revision ?? 0;
  }, [load]);

  /** A proposal that arrived in chat: show it in the panel as the pending one. */
  const receiveProposal = useCallback((proposal) => {
    if (!proposal?.id || !isPending(proposal)) return;
    const current = viewRef.current;
    if (current?.proposal?.id === proposal.id) return;
    if (current) commitView({ ...current, proposal });
    setLastApplied(null);
    announce(proposal);
    // The chat's copy may be older than the plan; settle on the server's.
    load().catch(() => {});
  }, [announce, commitView, load]);

  /** Create the one pending proposal from `ops`; resolves to it. */
  const propose = useCallback(async (ops) => {
    const attempt = async () => {
      const expected = await revisionNow();
      const { proposal } = await createProposal(tokenRef.current, { ops, expected_revision: expected });
      return proposal;
    };
    let proposal;
    try {
      proposal = await attempt();
    } catch (error) {
      if (plannerError(error).kind !== 'conflict') throw error;
      await recover();
      proposal = await attempt();
    }
    const current = viewRef.current;
    if (current) commitView({ ...current, proposal });
    setLastApplied(null);
    announce(proposal);
    return proposal;
  }, [announce, commitView, recover, revisionNow]);

  const accept = useCallback(async (proposal) => {
    const id = proposal?.id;
    if (!id) return null;
    setOutcome(id, { status: 'applying', error: null });
    try {
      const data = await acceptProposal(tokenRef.current, id);
      const next = { plan: data.plan, report: data.report, proposal: null, undo_label: undoLabelOf(data.plan) };
      commitView(next);
      setStatus('ready');
      setOutcome(id, { status: 'applied', revision: data.plan?.revision ?? null });
      setLastApplied({ id, added: proposal.diff?.courses?.added || [] });
      return data;
    } catch (error) {
      const info = plannerError(error);
      if (info.kind === 'needs_review') {
        setOutcome(id, { status: 'needs_review', proposal: info.proposal });
        const current = viewRef.current;
        if (current && info.proposal) commitView({ ...current, proposal: info.proposal });
        load().catch(() => {});
      } else if (info.kind === 'refused') {
        setOutcome(id, { status: 'refused', reason: info.reason });
      } else if (info.kind === 'conflict') {
        setOutcome(id, { status: 'needs_review', proposal: null });
        await recover();
      } else {
        setOutcome(id, {
          status: 'ready',
          error: info.kind === 'unavailable' ? "Couldn't reach the planner. Try again." : "Couldn't apply this change.",
        });
      }
      return null;
    }
  }, [commitView, load, recover, setOutcome]);

  const discard = useCallback(async (proposal) => {
    const id = proposal?.id;
    if (!id) return null;
    setOutcome(id, { status: 'discarding', error: null });
    try {
      await discardProposal(tokenRef.current, id);
      setOutcome(id, { status: 'discarded' });
      const current = viewRef.current;
      if (current?.proposal?.id === id) commitView({ ...current, proposal: null });
      return true;
    } catch (error) {
      setOutcome(id, { status: 'ready', error: "Couldn't discard this change." });
      return false;
    }
  }, [commitView, setOutcome]);

  /** The student's own edit from the panel; resolves to the new view or throws. */
  const edit = useCallback(async (ops) => {
    const key = newIdempotencyKey();
    const send = async () => postEdits(tokenRef.current, {
      ops, expected_revision: await revisionNow(), idempotency_key: key,
    });
    let data;
    try {
      data = await send();
    } catch (error) {
      if (plannerError(error).kind !== 'conflict') throw error;
      await recover();
      throw error;
    }
    const current = viewRef.current;
    commitView({
      plan: data.plan,
      report: data.report,
      proposal: current?.proposal || null,
      undo_label: data.undo_label ?? undoLabelOf(data.plan),
    });
    setStatus('ready');
    return data;
  }, [commitView, recover, revisionNow]);

  const undo = useCallback(async () => {
    try {
      const data = await undoEdit(tokenRef.current, { expected_revision: await revisionNow() });
      const current = viewRef.current;
      commitView({
        plan: data.plan,
        report: data.report,
        proposal: current?.proposal || null,
        undo_label: data.undo_label ?? undoLabelOf(data.plan),
      });
      setLastApplied(null);
      return data;
    } catch (error) {
      if (plannerError(error).kind === 'conflict') await recover();
      throw error;
    }
  }, [commitView, recover, revisionNow]);

  /** What a card should show for proposal `id`: a local outcome or null. */
  const proposalState = useCallback((id) => outcomes[id] || null, [outcomes]);

  const value = useMemo(() => ({
    view,
    status,
    programs,
    notice,
    lastApplied,
    load,
    ensureLoaded,
    receiveProposal,
    propose,
    accept,
    discard,
    edit,
    undo,
    proposalState,
    dismissNotice: () => setNotice(null),
  }), [view, status, programs, notice, lastApplied, load, ensureLoaded, receiveProposal, propose,
    accept, discard, edit, undo, proposalState]);

  return (
    <PlannerContext.Provider value={value}>
      {children}
      <div className="sr-only" role="status" aria-live="polite" data-testid="planner-announcer">
        {announcement}
      </div>
    </PlannerContext.Provider>
  );
}

/** The shared planner, or null outside a PlannerProvider. */
export function usePlanner() {
  return useContext(PlannerContext);
}
