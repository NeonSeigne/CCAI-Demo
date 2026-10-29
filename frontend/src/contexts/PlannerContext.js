import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import {
  acceptProposal,
  createProposal,
  discardProposal,
  getDegree,
  getPlan,
  listPrograms,
  newIdempotencyKey,
  plannerError,
  postEdits,
  preview as requestPreview,
  redoEdit,
  undoEdit,
} from '../api/planner';

/**
 * The signed-in student's semester plan, shared by the plan views and the
 * chat's proposal and shortlist cards so they never disagree (design 6A).
 *
 * The plan loads on first use (`ensureLoaded`), not on every page. Proposal
 * outcomes are kept per proposal id: a card reads `proposalState(id)` and the
 * panel reads `view.proposal`, both written by the same accept/discard calls.
 *
 * Writes (eng review C3, N3, N4):
 * - Edits, undo, redo and accept run through one FIFO queue. Each request
 *   sends the revision the one before it returned, so this tab never
 *   conflicts with itself. An edit's ops show at once (optimistic) and stay
 *   applied on top of every newer view until its request settles.
 * - An edit that fails without a definite answer (network, 5xx, or a
 *   timeout, which aborts the request) is resent with the same idempotency
 *   key after 0.5s, 1s and 2s. Then the queue holds: the caller's promise
 *   rejects with a held `saveError` (`queueState: 'error'`, "Couldn't save ·
 *   Retry") while the edit stays queued and shown, until `retry()`, the
 *   browser's `online` event or 30s. Only a 4xx reverts an edit; `retry()`
 *   sends a 422'd edit again.
 * - Undo, redo and accept carry no key. Without a definite answer the queue
 *   reads the plan up to three times (0.5s, 1s, 2s apart): undo / redo count
 *   as applied when the undo pointer took the step, accept when the plan
 *   moved and the proposal is no longer pending.
 * - Signing out or switching account drops the queue; nothing queued is
 *   sent with another account's token.
 * - A 409 revision conflict comes from another tab: refetch and raise the
 *   "Updated from another window" notice (10A).
 * - A view older than the newest known revision is dropped.
 */
export const PlannerContext = createContext(null);

const RETRY_DELAYS = [500, 1000, 2000];
const REQUEST_TIMEOUT_MS = 15000;
const RESUME_AFTER_MS = 30000;

/** "Undo: removed ECON 3010", read from the plan's undo stack. */
export function undoLabelOf(plan) {
  const undo = plan?.undo;
  if (!undo || !undo.pointer) return null;
  return undo.stack?.[undo.pointer - 1]?.label || null;
}

/** "Redo: removed ECON 3010", read from the step after the undo pointer. */
export function redoLabelOf(plan) {
  const undo = plan?.undo;
  const label = undo?.stack?.[undo.pointer || 0]?.label;
  if (!label) return null;
  return label.startsWith('Undo: ') ? `Redo: ${label.slice('Undo: '.length)}` : label;
}

const isPending = (proposal) => !!proposal && (proposal.status || 'pending') === 'pending';

/** Case- and space-insensitive, like the server's term matching. */
export const termKey = (term) => (term ? String(term).trim().replace(/\s+/g, ' ').toLowerCase() : '');

const sortedKeys = (value) => {
  if (Array.isArray(value)) return value.map(sortedKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((out, key) => {
    if (value[key] === undefined) return out;
    out[key] = key === 'sections' && Array.isArray(value[key]) ? [...value[key]].sort() : sortedKeys(value[key]);
    return out;
  }, {});
};

/**
 * The preview cache key (R2): the normalized ops payload, the plan revision
 * and the term, so previews for different terms or sections never mix.
 */
export function previewKey(ops, revision, term) {
  return JSON.stringify([sortedKeys(ops || []), revision ?? null, termKey(term)]);
}

const placeholderRow = (id, term) => ({
  id, title: null, term, credits: null, harder: null, gen_ed: null, offered: 'unknown',
  prereqs: { status: 'unknown', reason: null }, fills: [], pending: true,
});

/**
 * `view` with `ops` applied locally, for the cards to show before the server
 * answers. Every op is idempotent, so replaying one the view already holds
 * changes nothing.
 */
export function applyOps(view, ops) {
  if (!view?.plan || !ops?.length) return view;
  const plan = view.plan;
  const report = view.report;
  const shown = report?.term || plan.term;
  let courses = [...(plan.courses || [])];
  let rows = Array.isArray(report?.courses) ? [...report.courses] : null;
  let profile = plan.profile;

  const has = (id) => courses.some((c) => c.id === id);
  const termOf = (id) => courses.find((c) => c.id === id)?.term || plan.term;
  const drop = (id) => {
    courses = courses.filter((c) => c.id !== id);
    if (rows) rows = rows.filter((r) => r.id !== id);
  };
  const put = (id, term, sections = null) => {
    if (!has(id)) courses = [...courses, { id, term, sections }];
    if (rows && term === shown && !rows.some((r) => r.id === id)) rows = [...rows, placeholderRow(id, term)];
  };

  ops.forEach((op) => {
    if (!op) return;
    if (op.op === 'add' && op.course) put(op.course, op.term || plan.term, op.sections || null);
    else if (op.op === 'remove' && op.course) drop(op.course);
    else if (op.op === 'move' && op.course && op.to_term && has(op.course)) {
      courses = courses.map((c) => (c.id === op.course ? { ...c, term: op.to_term, sections: op.sections || null } : c));
      if (rows) {
        if (op.to_term === shown) {
          rows = rows.map((r) => (r.id === op.course ? { ...r, term: op.to_term } : r));
          if (!rows.some((r) => r.id === op.course)) rows = [...rows, placeholderRow(op.course, op.to_term)];
        } else {
          rows = rows.filter((r) => r.id !== op.course);
        }
      }
    } else if (op.op === 'swap' && op.out && op.in && has(op.out)) {
      const term = termOf(op.out);
      drop(op.out);
      put(op.in, term);
    } else if (op.op === 'pick_section' && op.course) {
      courses = courses.map((c) => (c.id === op.course ? { ...c, sections: op.sections || null } : c));
    } else if (op.op === 'set_profile') {
      const { op: _op, ...fields } = op;
      profile = { ...(profile || {}), ...fields };
    }
  });

  return {
    ...view,
    plan: { ...plan, courses, profile },
    report: rows ? { ...report, courses: rows } : report,
  };
}

const replay = (view, pending) => pending.reduce((current, entry) => applyOps(current, entry.ops), view);

/** The term an edit puts its course into, for the "Added to <term>" toast (D8). */
function landingTerm(ops, plan) {
  for (const op of ops || []) {
    if (op?.op === 'add') return op.term || plan?.term || null;
    if (op?.op === 'move') return op.to_term || null;
    if (op?.op === 'swap') return plan?.courses?.find((c) => c.id === op.in)?.term || plan?.term || null;
  }
  return null;
}

/** A 4xx is a definite answer; anything else might have been applied. */
const isDefinite = (error) => !!error && error.status >= 400 && error.status < 500;

const withLabels = (data) => ({
  ...data,
  undo_label: data.undo_label ?? undoLabelOf(data.plan),
  redo_label: data.redo_label ?? redoLabelOf(data.plan),
});

/** A queued write dropped because the student signed out or switched account. */
const sessionEnded = () => Object.assign(new Error('Signed out'), { code: 'session_ended' });

const timeoutError = () => Object.assign(new Error('Request timed out'), { timeout: true });

/** Accept applied: the plan moved AND this proposal is no longer the pending one. */
const acceptLanded = (id, expected) => (fresh) => (fresh.plan?.revision ?? -1) > expected
  && !(fresh.proposal?.id === id && isPending(fresh.proposal));

const swapPrefix = (label, from, to) => (label && label.startsWith(from) ? `${to}${label.slice(from.length)}` : null);

export function PlannerProvider({
  children,
  retryDelays = RETRY_DELAYS,
  timeoutMs = REQUEST_TIMEOUT_MS,
  resumeAfterMs = RESUME_AFTER_MS,
}) {
  const { authToken } = useAuth();
  // The newest view the server sent; `view` is it plus the queued edits.
  const [confirmed, setConfirmed] = useState(null);
  const [pending, setPending] = useState([]);
  // Edits that landed, with the revision each produced, for term views that lag (viewFor).
  const [landed, setLanded] = useState([]);
  const [queued, setQueued] = useState(0);
  const [held, setHeld] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [status, setStatus] = useState('idle');
  const [programs, setPrograms] = useState([]);
  const [notice, setNotice] = useState(null);
  const [outcomes, setOutcomes] = useState({});
  const [announcement, setAnnouncement] = useState('');
  // The proposal just applied, so its rows can turn from ghost to solid (13A).
  const [lastApplied, setLastApplied] = useState(null);
  const [termViews, setTermViews] = useState({});
  const [termErrors, setTermErrors] = useState({});
  const [degree, setDegree] = useState(null);

  const confirmedRef = useRef(confirmed);
  const newestRef = useRef(null);
  const statusRef = useRef(status);
  statusRef.current = status;
  const tokenRef = useRef(authToken);
  tokenRef.current = authToken;
  const delaysRef = useRef(retryDelays);
  delaysRef.current = retryDelays;
  const timeoutRef = useRef(timeoutMs);
  timeoutRef.current = timeoutMs;
  const resumeAfterRef = useRef(resumeAfterMs);
  resumeAfterRef.current = resumeAfterMs;
  // Bumped on every sign-in change; work from an older session is ignored.
  const genRef = useRef(0);
  const loadingRef = useRef(null);
  const programsRef = useRef(false);
  const queueRef = useRef([]);
  const runningGenRef = useRef(null);
  const holdRef = useRef(null);
  const holdTimerRef = useRef(null);
  const timersRef = useRef(new Set());
  const controllersRef = useRef(new Set());
  const saveErrorRef = useRef(null);
  saveErrorRef.current = saveError;
  const seqRef = useRef(0);
  // Counts local proposal writes, so a read started before one keeps its result (eng review 7).
  const proposalWritesRef = useRef(0);
  const previewsRef = useRef(new Map());
  const termLoadsRef = useRef(new Map());
  const degreeRef = useRef(null);
  const degreeLoadRef = useRef(null);
  const runRef = useRef(null);
  const resumeRef = useRef(null);

  const setOutcome = useCallback((id, outcome) => {
    if (!id) return;
    setOutcomes((current) => ({ ...current, [id]: { ...(current[id] || {}), ...outcome } }));
  }, []);

  const announce = useCallback((proposal) => {
    const heading = proposal?.diff?.heading;
    if (heading) setAnnouncement(`Proposed change ready: ${heading.charAt(0).toLowerCase()}${heading.slice(1)}`);
  }, []);

  /**
   * Put a newer server view in place (N4): one older than the newest known
   * revision is dropped. A replaced pending proposal is marked as such.
   */
  const commitView = useCallback((next) => {
    if (!next) return false;
    const revision = next.plan?.revision;
    if (revision != null && newestRef.current != null && revision < newestRef.current) return false;
    const before = confirmedRef.current?.proposal;
    if (before && isPending(before) && next.proposal && before.id !== next.proposal.id) {
      setOutcome(before.id, { status: 'replaced' });
    }
    if (revision != null) newestRef.current = revision;
    confirmedRef.current = next;
    setConfirmed(next);
    return true;
  }, [setOutcome]);

  /** A local proposal write (create, discard, accept): commit it and count it. */
  const commitProposalWrite = useCallback((next) => {
    proposalWritesRef.current += 1;
    return commitView(next);
  }, [commitView]);

  /** A write's response as a view; the pending proposal stays. */
  const viewOf = (data) => withLabels({
    plan: data.plan,
    report: data.report,
    proposal: confirmedRef.current?.proposal || null,
    undo_label: data.undo_label,
    redo_label: data.redo_label,
  });

  /** Fetch the plan; `fresh` skips joining a fetch already in flight. */
  const load = useCallback(async ({ fresh = false } = {}) => {
    const token = tokenRef.current;
    if (!token) return null;
    if (loadingRef.current && !fresh) return loadingRef.current;
    const gen = genRef.current;
    const writes = proposalWritesRef.current;
    // Program names for the header and the first-visit chips, once.
    if (!programsRef.current) {
      programsRef.current = true;
      listPrograms(token)
        .then((list) => { if (gen === genRef.current) setPrograms(list); })
        .catch(() => { if (gen === genRef.current) programsRef.current = false; });
    }
    setStatus((current) => (current === 'ready' ? current : 'loading'));
    const run = getPlan(token)
      .then((data) => {
        if (gen !== genRef.current) return data;
        let next = withLabels(data);
        // A proposal written here after this read started is newer than the read's.
        if (proposalWritesRef.current !== writes && confirmedRef.current) {
          next = { ...next, proposal: confirmedRef.current.proposal };
        }
        commitView(next);
        setStatus('ready');
        return data;
      })
      .catch((error) => {
        if (gen === genRef.current && statusRef.current !== 'ready') setStatus('error');
        throw error;
      })
      .finally(() => { if (loadingRef.current === run) loadingRef.current = null; });
    loadingRef.current = run;
    return run;
  }, [commitView]);

  const ensureLoaded = useCallback(() => {
    if (statusRef.current === 'idle' || statusRef.current === 'error') load().catch(() => {});
  }, [load]);

  // A different sign-in starts from nothing: queued writes are dropped, never
  // sent with the new token.
  const seenToken = useRef(authToken);
  useEffect(() => {
    if (seenToken.current === authToken) return;
    seenToken.current = authToken;
    genRef.current += 1;
    const dropped = queueRef.current;
    queueRef.current = [];
    dropped.forEach((entry) => (entry.kind === 'accept' ? entry.resolve(null) : entry.reject(sessionEnded())));
    controllersRef.current.forEach((controller) => controller.abort());
    controllersRef.current.clear();
    clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
    const hold = holdRef.current;
    holdRef.current = null;
    if (hold) hold.resume();
    confirmedRef.current = null;
    newestRef.current = null;
    loadingRef.current = null;
    degreeLoadRef.current = null;
    degreeRef.current = null;
    programsRef.current = false;
    previewsRef.current.clear();
    termLoadsRef.current.clear();
    setConfirmed(null);
    setPending([]);
    setLanded([]);
    setQueued(0);
    setHeld(false);
    setSaveError(null);
    setStatus('idle');
    setPrograms([]);
    setOutcomes({});
    setLastApplied(null);
    setNotice(null);
    setTermViews({});
    setTermErrors({});
    setDegree(null);
  }, [authToken]);

  // Timers and requests stop with the provider.
  useEffect(() => {
    const timers = timersRef.current;
    const controllers = controllersRef.current;
    const onOnline = () => resumeRef.current?.();
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('online', onOnline);
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
      controllers.forEach((controller) => controller.abort());
      controllers.clear();
      clearTimeout(holdTimerRef.current);
    };
  }, []);

  /** After a 409 from another tab: refetch and say so once. */
  const recover = useCallback(async () => {
    setNotice('conflict');
    try {
      await load({ fresh: true });
    } catch {
      // the panel keeps the last plan; its retry stays available
    }
  }, [load]);

  const revisionNow = useCallback(async () => {
    if (newestRef.current != null) return newestRef.current;
    const data = await load();
    return newestRef.current ?? data?.plan?.revision ?? 0;
  }, [load]);

  const wait = useCallback((ms) => new Promise((resolve) => {
    const timer = setTimeout(() => {
      timersRef.current.delete(timer);
      resolve();
    }, ms);
    timersRef.current.add(timer);
  }), []);

  /** `send(signal)` with the request timeout; a timeout aborts the request. */
  const timed = useCallback((send) => {
    const controller = new AbortController();
    controllersRef.current.add(controller);
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(timeoutError());
        controller.abort();
      }, timeoutRef.current);
    });
    return Promise.race([send(controller.signal), timeout]).finally(() => {
      clearTimeout(timer);
      controllersRef.current.delete(controller);
    });
  }, []);

  /** Throws once `entry`'s session has ended. */
  const live = (entry) => {
    if (entry.gen !== genRef.current) throw sessionEnded();
  };

  /** Resume a held queue; false when nothing is held. */
  const resume = useCallback(() => {
    const current = holdRef.current;
    if (!current) return false;
    holdRef.current = null;
    clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
    setHeld(false);
    setSaveError((error) => (error?.held ? null : error));
    current.entry.resumed = true;
    current.entry.onResume?.();
    current.resume();
    return true;
  }, []);
  resumeRef.current = resume;

  /**
   * Hold the queue on `entry` after its retries ran out. The caller hears
   * now (a held `saveError`) so nothing waits on it; the entry stays first
   * and resumes on `retry()`, the browser coming back online, or after
   * `resumeAfterMs`.
   */
  const hold = useCallback((entry, error) => new Promise((release) => {
    if (entry.gen !== genRef.current) {
      release();
      return;
    }
    const failure = Object.assign(error instanceof Error ? error : new Error("Couldn't save"), { held: true });
    holdRef.current = { resume: release, entry };
    setHeld(true);
    setSaveError({ held: true, kind: entry.kind, ops: entry.ops || null, message: null, error: failure });
    if (entry.onHold) entry.onHold(failure);
    else entry.reject(failure);
    clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(() => resumeRef.current?.(), resumeAfterRef.current);
  }), []);

  /** Wait out retry `attempt` (0.5s, 1s, 2s), then hold; returns the next attempt. */
  const backoff = async (entry, attempt, error) => {
    const delays = delaysRef.current;
    if (attempt < delays.length) {
      await wait(delays[attempt]);
      live(entry);
      return attempt + 1;
    }
    await hold(entry, error);
    live(entry);
    return 0;
  };

  /**
   * After a write with no definite answer: read the plan up to three times,
   * 0.5s, 1s and 2s apart. The fresh view once `applied(view)`; null when the
   * reads show it didn't apply; with no read answered, hold and read again.
   */
  const poll = async (entry, applied, error) => {
    for (;;) {
      let seen = false;
      let failure = error;
      for (const ms of delaysRef.current) {
        // eslint-disable-next-line no-await-in-loop
        await wait(ms);
        live(entry);
        try {
          // eslint-disable-next-line no-await-in-loop
          const fresh = withLabels(await timed((signal) => getPlan(entry.token, {}, { signal })));
          live(entry);
          commitView(fresh);
          setStatus('ready');
          seen = true;
          if (applied(fresh)) return fresh;
        } catch (readError) {
          live(entry);
          failure = readError;
        }
      }
      if (seen) return null;
      // eslint-disable-next-line no-await-in-loop
      await hold(entry, failure);
      live(entry);
    }
  };

  const runEdit = async (entry) => {
    const { ops, key } = entry;
    let expected = null;
    let attempt = 0;
    let data;
    for (;;) {
      try {
        // eslint-disable-next-line no-await-in-loop
        if (expected == null) expected = await revisionNow();
        live(entry);
        const body = { ops, expected_revision: expected, idempotency_key: key };
        // eslint-disable-next-line no-await-in-loop
        data = await timed((signal) => postEdits(entry.token, body, { signal }));
        live(entry);
        break;
      } catch (error) {
        live(entry);
        if (isDefinite(error)) {
          const info = plannerError(error);
          if (info.kind === 'conflict') {
            // eslint-disable-next-line no-await-in-loop
            await recover();
          } else {
            setSaveError({ held: false, kind: 'edit', ops, onSaved: entry.onSaved, message: info.message || null, error });
          }
          throw error;
        }
        // Same key again: the server answers a repeat with the first result (N3).
        // eslint-disable-next-line no-await-in-loop
        attempt = await backoff(entry, attempt, error);
      }
    }
    if (data?.plan) {
      commitView(viewOf(data));
      const revision = data.plan.revision;
      setLanded((list) => [...list.slice(-49), { ops, revision }]);
    }
    setStatus('ready');
    try {
      entry.onSaved?.({ ops, data, term: landingTerm(ops, data?.plan) });
    } catch {
      // a toast callback never fails the edit
    }
    return data;
  };

  const runStep = async (entry) => {
    const isRedo = entry.kind === 'redo';
    const send = isRedo ? redoEdit : undoEdit;
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const expected = await revisionNow();
      live(entry);
      const before = confirmedRef.current;
      const pointer = before?.plan?.undo?.pointer;
      const wantPointer = pointer == null ? null : pointer + (isRedo ? 1 : -1);
      const wantLabel = isRedo
        ? swapPrefix(before?.redo_label, 'Redo: ', 'Undo: ')
        : swapPrefix(before?.undo_label, 'Undo: ', 'Redo: ');
      // Applied when the revision moved and the undo pointer took this step.
      const applied = (fresh) => {
        if ((fresh.plan?.revision ?? -1) <= expected) return false;
        const now = fresh.plan?.undo?.pointer;
        if (wantPointer != null && now != null) return now === wantPointer;
        return (isRedo ? fresh.undo_label : fresh.redo_label) === wantLabel;
      };
      try {
        // eslint-disable-next-line no-await-in-loop
        const data = await timed((signal) => send(entry.token, { expected_revision: expected }, { signal }));
        live(entry);
        if (data?.plan) commitView(viewOf(data));
        setLastApplied(null);
        return data;
      } catch (error) {
        live(entry);
        if (isDefinite(error)) {
          // eslint-disable-next-line no-await-in-loop
          if (plannerError(error).kind === 'conflict') await recover();
          throw error;
        }
        entry.resumed = false;
        // eslint-disable-next-line no-await-in-loop
        const fresh = await poll(entry, applied, error);
        if (fresh) {
          setLastApplied(null);
          return fresh;
        }
        // Known not applied. Send it again only when the student asked (Retry).
        if (!entry.resumed) throw error;
      }
    }
  };

  const runAccept = async (entry) => {
    const { proposal } = entry;
    const id = proposal.id;
    entry.onHold = () => {
      setOutcome(id, { status: 'ready', held: true, error: null });
      entry.resolve(null);
    };
    entry.onResume = () => setOutcome(id, { status: 'applying', held: false, error: null });
    const markApplied = (next) => {
      setStatus('ready');
      setOutcome(id, { status: 'applied', held: false, revision: next.plan?.revision ?? null });
      setLastApplied({ id, added: proposal.diff?.courses?.added || [] });
    };
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const expected = await revisionNow().catch(() => newestRef.current ?? 0);
      live(entry);
      try {
        // eslint-disable-next-line no-await-in-loop
        const data = await timed((signal) => acceptProposal(entry.token, id, { signal }));
        live(entry);
        commitProposalWrite(withLabels({
          plan: data.plan, report: data.report, proposal: null, undo_label: data.undo_label, redo_label: data.redo_label,
        }));
        markApplied(data);
        return data;
      } catch (error) {
        live(entry);
        if (!isDefinite(error)) {
          entry.resumed = false;
          // eslint-disable-next-line no-await-in-loop
          const fresh = await poll(entry, acceptLanded(id, expected), error);
          if (fresh) {
            proposalWritesRef.current += 1;
            markApplied(fresh);
            return fresh;
          }
          if (entry.resumed) continue; // eslint-disable-line no-continue
          setOutcome(id, { status: 'ready', held: false, error: "Couldn't reach the planner. Try again." });
          return null;
        }
        const info = plannerError(error);
        if (info.kind === 'needs_review') {
          setOutcome(id, { status: 'needs_review', proposal: info.proposal });
          const current = confirmedRef.current;
          if (current && info.proposal) commitProposalWrite({ ...current, proposal: info.proposal });
          load({ fresh: true }).catch(() => {});
        } else if (info.kind === 'refused') {
          setOutcome(id, { status: 'refused', reason: info.reason });
        } else if (info.kind === 'conflict') {
          setOutcome(id, { status: 'needs_review', proposal: null });
          // eslint-disable-next-line no-await-in-loop
          await recover();
        } else {
          setOutcome(id, { status: 'ready', error: "Couldn't apply this change." });
        }
        return null;
      }
    }
  };

  runRef.current = (entry) => {
    if (entry.kind === 'edit') return runEdit(entry);
    if (entry.kind === 'accept') return runAccept(entry);
    return runStep(entry);
  };

  const pump = useCallback(async () => {
    const gen = genRef.current;
    if (runningGenRef.current === gen) return;
    runningGenRef.current = gen;
    while (genRef.current === gen && queueRef.current.length) {
      const entry = queueRef.current[0];
      let result;
      let failure;
      let failed = false;
      try {
        // eslint-disable-next-line no-await-in-loop
        result = await runRef.current(entry);
      } catch (error) {
        failed = true;
        failure = error;
      }
      if (genRef.current !== gen) break;
      queueRef.current.shift();
      if (entry.kind === 'edit') setPending((list) => list.filter((item) => item.id !== entry.id));
      setQueued(queueRef.current.length);
      if (failed) entry.reject(failure);
      else entry.resolve(result);
    }
    if (runningGenRef.current === gen) runningGenRef.current = null;
  }, []);

  const enqueue = useCallback((entry) => {
    let settle;
    const promise = new Promise((resolve, reject) => { settle = { resolve, reject }; });
    let settled = false;
    const once = (fn) => (value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };
    queueRef.current.push({
      ...entry,
      gen: genRef.current,
      token: tokenRef.current,
      resolve: once(settle.resolve),
      reject: once(settle.reject),
      done: promise.then(() => {}, () => {}),
    });
    setQueued(queueRef.current.length);
    pump();
    return promise;
  }, [pump]);

  /** Resolves once the writes queued so far settle (at once while the queue holds). */
  const queueSettled = useCallback(() => {
    const last = queueRef.current[queueRef.current.length - 1];
    if (!last || holdRef.current) return Promise.resolve();
    return last.done;
  }, []);

  /**
   * The student's own edit: shows at once, resolves to the server's answer,
   * or throws on a 4xx (the edit is reverted) or when the queue holds (the
   * edit stays and is saved on retry). `onSaved({ops, data, term})` runs
   * when it lands, for the "Added to <term>" toast (D8).
   */
  const edit = useCallback((ops, { onSaved } = {}) => {
    seqRef.current += 1;
    const id = seqRef.current;
    setPending((list) => [...list, { id, ops }]);
    return enqueue({ kind: 'edit', id, ops, key: newIdempotencyKey(), onSaved });
  }, [enqueue]);

  const undo = useCallback(() => enqueue({ kind: 'undo' }), [enqueue]);
  const redo = useCallback(() => enqueue({ kind: 'redo' }), [enqueue]);

  const accept = useCallback((proposal) => {
    if (!proposal?.id) return Promise.resolve(null);
    setOutcome(proposal.id, { status: 'applying', held: false, error: null });
    return enqueue({ kind: 'accept', proposal });
  }, [enqueue, setOutcome]);

  /** Resume a held queue, or send the edit a 4xx turned down again. */
  const retry = useCallback(() => {
    if (resume()) return;
    const failed = saveErrorRef.current;
    if (failed && !failed.held && failed.kind === 'edit') {
      saveErrorRef.current = null;
      setSaveError(null);
      edit(failed.ops, { onSaved: failed.onSaved }).catch(() => {});
    }
  }, [edit, resume]);

  /** A proposal that arrived in chat: show it in the panel as the pending one. */
  const receiveProposal = useCallback((proposal) => {
    if (!proposal?.id || !isPending(proposal)) return;
    const current = confirmedRef.current;
    if (current?.proposal?.id === proposal.id) return;
    if (current) commitView({ ...current, proposal });
    setLastApplied(null);
    announce(proposal);
    // The chat's copy may be older than the plan; settle on the server's.
    load().catch(() => {});
  }, [announce, commitView, load]);

  /**
   * Create the one pending proposal from `ops`, its diff drawn for `term`
   * when given; resolves to it. Waits for the writes already queued.
   */
  const propose = useCallback(async (ops, { term } = {}) => {
    await queueSettled();
    const attempt = async () => {
      const expected = await revisionNow();
      const body = term ? { ops, expected_revision: expected, term } : { ops, expected_revision: expected };
      const { proposal } = await createProposal(tokenRef.current, body);
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
    const current = confirmedRef.current;
    if (current) commitProposalWrite({ ...current, proposal });
    else proposalWritesRef.current += 1;
    setLastApplied(null);
    announce(proposal);
    return proposal;
  }, [announce, commitProposalWrite, queueSettled, recover, revisionNow]);

  const discard = useCallback(async (proposal) => {
    const id = proposal?.id;
    if (!id) return null;
    setOutcome(id, { status: 'discarding', error: null });
    try {
      await discardProposal(tokenRef.current, id);
      setOutcome(id, { status: 'discarded' });
      const current = confirmedRef.current;
      if (current?.proposal?.id === id) commitProposalWrite({ ...current, proposal: null });
      else proposalWritesRef.current += 1;
      return true;
    } catch (error) {
      setOutcome(id, { status: 'ready', error: "Couldn't discard this change." });
      return false;
    }
  }, [commitProposalWrite, setOutcome]);

  /**
   * The diff `ops` would make, seen in `term` (R2); writes nothing. Cached by
   * the normalized ops, the revision and the term. A 409 refetches once.
   */
  const preview = useCallback((ops, term) => {
    const cache = previewsRef.current;
    const key = previewKey(ops, newestRef.current, term);
    if (cache.has(key)) return cache.get(key);
    if (cache.size > 50) cache.clear();
    const token = tokenRef.current;
    const send = (expected) => requestPreview(token, { ops, expected_revision: expected, term });
    const run = (async () => {
      const expected = await revisionNow();
      try {
        return await send(expected);
      } catch (error) {
        if (plannerError(error).kind !== 'conflict') throw error;
        await load({ fresh: true });
        return send(newestRef.current);
      }
    })();
    cache.set(key, run);
    run.catch(() => { if (cache.get(key) === run) cache.delete(key); });
    return run;
  }, [load, revisionNow]);

  /** Fetch the plan checked for `term`; one request per term and revision. */
  const loadTerm = useCallback((term, { force = false } = {}) => {
    const norm = termKey(term);
    const revision = newestRef.current;
    const loadKey = `${norm}|${revision ?? ''}`;
    const loads = termLoadsRef.current;
    if (!force && loads.has(loadKey)) return loads.get(loadKey);
    const gen = genRef.current;
    const run = getPlan(tokenRef.current, { term })
      .then((data) => {
        if (gen !== genRef.current) return data;
        const got = data?.plan?.revision;
        if (got != null && newestRef.current != null && got > newestRef.current) {
          load({ fresh: true }).catch(() => {});
        }
        setTermViews((current) => {
          const before = current[norm];
          if (before && (before.plan?.revision ?? -1) > (got ?? -1)) return current;
          return { ...current, [norm]: withLabels(data) };
        });
        setTermErrors((current) => {
          if (!current[norm]) return current;
          const { [norm]: _gone, ...rest } = current;
          return rest;
        });
        return data;
      }, (error) => {
        if (gen === genRef.current) {
          if (loads.get(loadKey) === run) loads.delete(loadKey);
          setTermErrors((current) => ({ ...current, [norm]: { error, revision } }));
        }
        throw error;
      });
    run.catch(() => {});
    loads.set(loadKey, run);
    return run;
  }, [load]);

  const view = useMemo(() => (confirmed ? replay(confirmed, pending) : null), [confirmed, pending]);

  /** The last failed fetch of `term` at the current revision, or null. */
  const termError = useCallback((term) => {
    const failed = termErrors[termKey(term)];
    if (!failed || failed.revision !== (confirmed?.plan?.revision ?? null)) return null;
    return failed.error;
  }, [confirmed, termErrors]);

  /** Fetch `term` again after a failure. */
  const reloadTerm = useCallback((term) => {
    const norm = termKey(term);
    setTermErrors((current) => {
      const { [norm]: _gone, ...rest } = current;
      return rest;
    });
    return loadTerm(term, { force: true });
  }, [loadTerm]);

  /**
   * The plan as seen in `term`: the shared plan with that term's report,
   * landed and queued edits applied. Null until the term's first fetch
   * lands (see `termError`); a fetch starts whenever the cached one is
   * older than the plan, unless it just failed at this revision.
   */
  const viewFor = useCallback((term) => {
    if (!term) return view;
    if (!confirmed) return null;
    const norm = termKey(term);
    if (termKey(confirmed.report?.term || confirmed.plan?.term) === norm) return view;
    const entry = termViews[norm];
    const revision = confirmed.plan?.revision;
    const failed = termErrors[norm];
    const blocked = failed && failed.revision === revision;
    if (tokenRef.current && !blocked && (!entry || entry.plan?.revision !== revision)) loadTerm(term);
    if (!entry) return null;
    const since = entry.plan?.revision ?? -1;
    const base = {
      ...entry,
      plan: confirmed.plan,
      proposal: confirmed.proposal,
      undo_label: confirmed.undo_label,
      redo_label: confirmed.redo_label,
    };
    return replay(replay(base, landed.filter((item) => item.revision > since)), pending);
  }, [confirmed, landed, loadTerm, pending, termErrors, termViews, view]);

  /** The degree board, fetched again only when the plan moved past it (or `force`). */
  const refreshDegree = useCallback(({ force = false } = {}) => {
    if (!tokenRef.current) return Promise.resolve(null);
    if (degreeLoadRef.current) return degreeLoadRef.current;
    const cached = degreeRef.current;
    if (!force && cached && newestRef.current != null && cached.revision >= newestRef.current) {
      return Promise.resolve(cached);
    }
    const gen = genRef.current;
    const run = getDegree(tokenRef.current)
      .then((data) => {
        if (gen !== genRef.current) return data;
        const before = degreeRef.current;
        if (before && (before.revision ?? -1) > (data?.revision ?? -1)) return before;
        degreeRef.current = data;
        setDegree(data);
        return data;
      })
      .finally(() => { if (degreeLoadRef.current === run) degreeLoadRef.current = null; });
    degreeLoadRef.current = run;
    return run;
  }, []);

  /** The pending proposal, `stale` once an edit landed after its base revision (D9). */
  const pendingProposal = useMemo(() => {
    const proposal = confirmed?.proposal;
    if (!isPending(proposal)) return null;
    const revision = confirmed.plan?.revision;
    const stale = proposal.base_revision != null && revision != null && revision > proposal.base_revision;
    return { ...proposal, stale };
  }, [confirmed]);

  /** What a card should show for proposal `id`: a local outcome or null. */
  const proposalState = useCallback((id) => outcomes[id] || null, [outcomes]);

  const dismissNotice = useCallback(() => setNotice(null), []);
  const dismissSaveError = useCallback(() => setSaveError(null), []);

  let queueState = 'idle';
  if (saveError) queueState = 'error';
  else if (queued > 0) queueState = 'saving';
  const undoLabel = confirmed?.undo_label || null;
  const redoLabel = confirmed?.redo_label || null;

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
    redo,
    retry,
    queueState,
    queueHeld: held,
    saveError,
    dismissSaveError,
    undoLabel,
    redoLabel,
    canUndo: !!undoLabel,
    canRedo: !!redoLabel,
    degree,
    refreshDegree,
    viewFor,
    termError,
    reloadTerm,
    preview,
    pendingProposal,
    proposalState,
    dismissNotice,
  }), [view, status, programs, notice, lastApplied, load, ensureLoaded, receiveProposal, propose,
    accept, discard, edit, undo, redo, retry, queueState, held, saveError, dismissSaveError, undoLabel,
    redoLabel, degree, refreshDegree, viewFor, termError, reloadTerm, preview, pendingProposal, proposalState,
    dismissNotice]);

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
