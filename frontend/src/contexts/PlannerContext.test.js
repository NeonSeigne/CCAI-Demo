import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { PlannerProvider, applyOps, previewKey, usePlanner } from './PlannerContext';
import { plan, proposal, report } from '../components/planner/plannerFixtures';

let mockToken = 'token';
jest.mock('./AuthContext', () => ({ useAuth: () => ({ authToken: mockToken }) }));

const deferred = () => {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
};

const abortError = () => Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });

/**
 * A planner backend behind `fetch`: one plan with a revision, idempotency
 * keys, an undo stack, one proposal and the 409 / 422 answers.
 * `server.once(match, run)` adds a one-shot hook `(req, next) => answer` that
 * can delay an answer, lose it after the write (`await next(); throw ...`),
 * fail before it, or never answer (the request's AbortSignal still ends it).
 */
function fakeServer() {
  const s = {
    revision: 4,
    courses: [
      { id: 'CHEM 2410', term: 'Spring 2027', sections: null },
      { id: 'ECON 3720', term: 'Spring 2027', sections: null },
    ],
    proposal: null,
    keys: new Map(),
    stack: [],
    pointer: 0,
    unknown: new Set(),
    calls: [],
    intercept: [],
  };

  const label = (ops) => `Undo: ${ops.map((op) => `${op.op === 'add' ? 'added' : 'removed'} ${op.course}`).join(', ')}`;
  const planDoc = () => plan({
    revision: s.revision,
    courses: s.courses.map((c) => ({ ...c })),
    undo: { pointer: s.pointer, stack: s.stack.map((e) => ({ label: e.label, revision: e.revision })) },
  });
  const viewBody = (term = 'Spring 2027') => {
    const p = planDoc();
    return {
      plan: p,
      report: report({
        term,
        courses: p.courses.filter((c) => c.term === term).map((c) => ({
          id: c.id, title: `Course ${c.id}`, term: c.term, credits: [3, 3], harder: false, gen_ed: null,
          offered: 'yes', prereqs: { status: 'met', reason: null }, fills: [],
        })),
      }),
      proposal: s.proposal,
      undo_label: s.pointer ? s.stack[s.pointer - 1].label : null,
      redo_label: s.stack[s.pointer] ? s.stack[s.pointer].label.replace(/^Undo: /, 'Redo: ') : null,
    };
  };
  const conflict = () => ({ status: 409, body: { detail: { code: 'revision_conflict', revision: s.revision } } });
  const applyOpsHere = (ops) => {
    ops.forEach((op) => {
      if (op.op === 'add' && !s.courses.some((c) => c.id === op.course)) {
        s.courses.push({ id: op.course, term: op.term || 'Spring 2027', sections: null });
      }
      if (op.op === 'remove') s.courses = s.courses.filter((c) => c.id !== op.course);
    });
  };
  const invert = (ops) => ops.map((op) => (op.op === 'add' ? { op: 'remove', course: op.course } : { op: 'add', course: op.course }));
  const commit = (ops) => {
    applyOpsHere(ops);
    s.revision += 1;
    s.stack = [...s.stack.slice(0, s.pointer), { ops, label: label(ops), revision: s.revision }];
    s.pointer = s.stack.length;
  };

  /** Another tab's edit. */
  s.otherTab = (ops) => commit(ops);

  s.handle = ({ path, method, body, query }) => {
    if (method === 'GET' && path === '/api/planner/plan') return { status: 200, body: viewBody(query.get('term') || undefined) };
    if (method === 'GET' && path === '/api/planner/programs') return { status: 200, body: [] };
    if (method === 'GET' && path === '/api/planner/degree') return { status: 200, body: { revision: s.revision, terms: [] } };
    if (path === '/api/planner/edits') {
      if (s.keys.has(body.idempotency_key)) return { status: 200, body: { ...viewBody(), notes: [] } };
      if (body.expected_revision !== s.revision) return conflict();
      const bad = body.ops.find((op) => s.unknown.has(op.course));
      if (bad) {
        return { status: 422, body: { detail: { code: 'unknown_course', message: `${bad.course} isn't in the catalog`, course: bad.course } } };
      }
      commit(body.ops);
      s.keys.set(body.idempotency_key, s.revision);
      return { status: 200, body: { ...viewBody(), notes: [] } };
    }
    if (path === '/api/planner/undo' || path === '/api/planner/redo') {
      if (body.expected_revision !== s.revision) return conflict();
      const isUndo = path.endsWith('undo');
      const entry = isUndo ? s.stack[s.pointer - 1] : s.stack[s.pointer];
      if (!entry) return { status: 409, body: { detail: { status: 'refused', reason: 'Nothing to do' } } };
      applyOpsHere(isUndo ? invert(entry.ops) : entry.ops);
      s.pointer += isUndo ? -1 : 1;
      s.revision += 1;
      return { status: 200, body: viewBody() };
    }
    const accept = path.match(/^\/api\/planner\/proposals\/(.+)\/accept$/);
    if (accept) {
      if (!s.proposal || s.proposal.id !== decodeURIComponent(accept[1])) {
        return { status: 409, body: { detail: { status: 'refused', reason: 'Gone' } } };
      }
      commit(s.proposal.ops);
      s.proposal = null;
      const { plan: p, report: r } = viewBody();
      return { status: 200, body: { plan: p, report: r } };
    }
    if (/\/discard$/.test(path)) {
      const gone = { ...s.proposal, status: 'discarded' };
      s.proposal = null;
      return { status: 200, body: { proposal: gone } };
    }
    if (path === '/api/planner/preview') {
      if (body.expected_revision !== s.revision) return conflict();
      return { status: 200, body: { diff: { heading: `Preview for ${body.term || 'Spring 2027'}` }, revision: s.revision } };
    }
    return { status: 404, body: { detail: 'Not Found' } };
  };

  s.fetch = jest.fn(async (url, init = {}) => {
    const [path, search = ''] = url.split('?');
    const req = {
      path,
      method: init.method || 'GET',
      body: init.body ? JSON.parse(init.body) : null,
      query: new URLSearchParams(search),
      auth: init.headers?.Authorization || null,
      signal: init.signal || null,
    };
    s.calls.push(req);
    const index = s.intercept.findIndex((hook) => hook.match(req));
    const next = async () => s.handle(req);
    const answering = index >= 0 ? s.intercept.splice(index, 1)[0].run(req, next) : next();
    const aborted = new Promise((_, reject) => {
      if (!req.signal) return;
      if (req.signal.aborted) reject(abortError());
      req.signal.addEventListener('abort', () => reject(abortError()));
    });
    const answer = await Promise.race([answering, aborted]);
    return {
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      text: async () => JSON.stringify(answer.body),
    };
  });

  /** Requests to `path` (and `method`), in order. */
  s.sent = (path, method = 'POST') => s.calls.filter((c) => c.path === path && c.method === method);
  s.once = (match, run) => s.intercept.push({ match, run });
  s.times = (n, match, run) => { for (let i = 0; i < n; i += 1) s.once(match, run); };
  return s;
}

const isEdit = (req) => req.path === '/api/planner/edits';
const isRead = (req) => req.method === 'GET' && req.path === '/api/planner/plan';
const lost = () => { throw new TypeError('Failed to fetch'); };
const down = () => ({ status: 503, body: { detail: 'down' } });
const never = () => new Promise(() => {});
const ids = (view) => (view?.report?.courses || []).map((c) => c.id);

let server;
let planner;

function Probe() {
  planner = usePlanner();
  return null;
}

const tree = (props) => <PlannerProvider retryDelays={[0, 0, 0]} {...props}><Probe /></PlannerProvider>;

async function mountLoaded(props = {}) {
  const utils = render(tree(props));
  await act(async () => { await planner.load(); });
  await waitFor(() => expect(planner.view?.plan?.revision).toBe(server.revision));
  return utils;
}

const originalFetch = global.fetch;
beforeEach(() => {
  mockToken = 'token';
  server = fakeServer();
  global.fetch = server.fetch;
});
afterEach(() => {
  global.fetch = originalFetch;
});

test('two edits within 100ms both land, in order, on chained revisions, with the toast term', async () => {
  await mountLoaded();
  const saved = [];
  let first;
  let second;
  act(() => {
    first = planner.edit([{ op: 'add', course: 'ECON 3300' }], { onSaved: (info) => saved.push(info) });
    second = planner.edit([{ op: 'add', course: 'ECON 4400', term: 'Fall 2027' }], { onSaved: (info) => saved.push(info) });
  });
  // Optimistic: the first card shows before any answer, and the queue is saving.
  expect(ids(planner.view)).toContain('ECON 3300');
  expect(planner.view.plan.courses.map((c) => c.id)).toEqual(expect.arrayContaining(['ECON 3300', 'ECON 4400']));
  expect(planner.queueState).toBe('saving');

  await act(async () => { await Promise.all([first, second]); });
  const edits = server.sent('/api/planner/edits');
  expect(edits.map((c) => c.body.ops[0].course)).toEqual(['ECON 3300', 'ECON 4400']);
  expect(edits.map((c) => c.body.expected_revision)).toEqual([4, 5]);
  expect(planner.view.plan.revision).toBe(6);
  expect(planner.view.plan.courses.map((c) => c.id)).toEqual(['CHEM 2410', 'ECON 3720', 'ECON 3300', 'ECON 4400']);
  expect(planner.notice).toBeNull();
  expect(planner.queueState).toBe('idle');
  expect(saved.map((s) => s.term)).toEqual(['Spring 2027', 'Fall 2027']);
  expect(planner.undoLabel).toBe('Undo: added ECON 4400');
  expect(planner.canUndo).toBe(true);
  expect(planner.canRedo).toBe(false);
});

test('a committed edit whose response is lost is resent with the same key, kept, and the next edit lands', async () => {
  await mountLoaded();
  server.once(isEdit, async (req, next) => { await next(); lost(); });
  let first;
  let second;
  act(() => {
    first = planner.edit([{ op: 'add', course: 'ECON 3300' }]);
    second = planner.edit([{ op: 'add', course: 'ECON 4400' }]);
  });
  await act(async () => { await Promise.all([first, second]); });

  const edits = server.sent('/api/planner/edits');
  expect(edits).toHaveLength(3);
  expect(edits[1].body.idempotency_key).toBe(edits[0].body.idempotency_key);
  expect(edits[1].body.expected_revision).toBe(4);
  expect(edits[2].body.ops[0].course).toBe('ECON 4400');
  expect(edits[2].body.expected_revision).toBe(5);
  expect(server.courses.filter((c) => c.id === 'ECON 3300')).toHaveLength(1);
  expect(ids(planner.view)).toEqual(['CHEM 2410', 'ECON 3720', 'ECON 3300', 'ECON 4400']);
  expect(planner.view.plan.revision).toBe(6);
  expect(planner.queueState).toBe('idle');
});

test('a 5xx through every retry holds: the caller hears at once, the edit stays, retry() saves it', async () => {
  await mountLoaded();
  server.times(4, isEdit, async () => down());
  let pending;
  act(() => { pending = planner.edit([{ op: 'add', course: 'ECON 3300' }]); });
  await act(async () => {
    await expect(pending).rejects.toMatchObject({ held: true, status: 503 });
  });
  expect(server.sent('/api/planner/edits')).toHaveLength(4);
  expect(planner.queueHeld).toBe(true);
  expect(planner.queueState).toBe('error');
  expect(planner.saveError).toMatchObject({ held: true, kind: 'edit' });
  expect(ids(planner.view)).toContain('ECON 3300');

  await act(async () => { planner.retry(); });
  await waitFor(() => expect(planner.queueState).toBe('idle'));
  const keys = new Set(server.sent('/api/planner/edits').map((c) => c.body.idempotency_key));
  expect(keys.size).toBe(1);
  expect(planner.queueHeld).toBe(false);
  expect(planner.view.plan.revision).toBe(5);
  expect(ids(planner.view)).toContain('ECON 3300');
});

test('a timeout aborts the request and retries; held after the last, it resumes when the browser is back online', async () => {
  await mountLoaded({ timeoutMs: 20 });
  server.times(4, isEdit, never);
  let pending;
  act(() => { pending = planner.edit([{ op: 'add', course: 'ECON 3300' }]); });
  await act(async () => { await expect(pending).rejects.toMatchObject({ held: true, timeout: true }); });
  const tries = server.sent('/api/planner/edits');
  expect(tries).toHaveLength(4);
  expect(tries.every((c) => c.signal.aborted)).toBe(true);
  expect(planner.queueState).toBe('error');

  await act(async () => { window.dispatchEvent(new Event('online')); });
  await waitFor(() => expect(planner.queueState).toBe('idle'));
  expect(planner.view.plan.revision).toBe(5);
  expect(server.sent('/api/planner/edits')).toHaveLength(5);
});

test('a held queue resumes on its own after resumeAfterMs', async () => {
  await mountLoaded({ resumeAfterMs: 30 });
  server.times(4, isEdit, async () => lost());
  let pending;
  act(() => { pending = planner.edit([{ op: 'add', course: 'ECON 3300' }]); });
  await act(async () => { await expect(pending).rejects.toMatchObject({ held: true }); });
  await waitFor(() => expect(planner.view.plan.revision).toBe(5));
  expect(server.sent('/api/planner/edits')).toHaveLength(5);
  expect(planner.queueState).toBe('idle');
});

test('a 4xx reverts only its own edit and the queue continues; retry() sends it again', async () => {
  await mountLoaded();
  server.unknown.add('BAD 1000');
  let bad;
  let good;
  act(() => {
    bad = planner.edit([{ op: 'add', course: 'BAD 1000' }]);
    good = planner.edit([{ op: 'add', course: 'ECON 3300' }]);
  });
  expect(ids(planner.view)).toEqual(expect.arrayContaining(['BAD 1000', 'ECON 3300']));
  await act(async () => {
    await expect(bad).rejects.toMatchObject({ status: 422 });
    await good;
  });
  expect(ids(planner.view)).not.toContain('BAD 1000');
  expect(ids(planner.view)).toContain('ECON 3300');
  expect(planner.view.plan.revision).toBe(5);
  expect(planner.queueState).toBe('error');
  expect(planner.saveError.message).toBe("BAD 1000 isn't in the catalog");
  expect(planner.notice).toBeNull();

  server.unknown.clear();
  await act(async () => { planner.retry(); });
  await waitFor(() => expect(planner.queueState).toBe('idle'));
  expect(ids(planner.view)).toContain('BAD 1000');
  expect(planner.view.plan.revision).toBe(6);
});

test('a 409 from another tab refetches, reverts the edit and raises the notice', async () => {
  await mountLoaded();
  server.otherTab([{ op: 'add', course: 'HIST 1010' }]);
  let pending;
  act(() => { pending = planner.edit([{ op: 'remove', course: 'ECON 3720' }]); });
  await act(async () => { await expect(pending).rejects.toMatchObject({ status: 409 }); });
  expect(planner.notice).toBe('conflict');
  expect(planner.view.plan.revision).toBe(5);
  expect(ids(planner.view)).toEqual(['CHEM 2410', 'ECON 3720', 'HIST 1010']);
  expect(planner.queueState).toBe('idle');
});

test('a delayed load resolving between two queued writes erases neither card; the newest revision wins', async () => {
  await mountLoaded();
  const slowLoad = deferred();
  const slowEdit = deferred();
  // The read is answered with revision 4 but arrives late.
  server.once(isRead, async (req, next) => {
    const answer = await next();
    await slowLoad.promise;
    return answer;
  });
  // The second write waits until the stale read has arrived.
  server.once((req) => isEdit(req) && req.body.ops[0].course === 'ECON 4400', async (req, next) => {
    await slowEdit.promise;
    return next();
  });

  let reading;
  let first;
  let second;
  act(() => {
    reading = planner.load({ fresh: true });
    first = planner.edit([{ op: 'add', course: 'ECON 3300' }]);
    second = planner.edit([{ op: 'add', course: 'ECON 4400' }]);
  });
  await act(async () => { await first; });
  expect(planner.view.plan.revision).toBe(5);

  await act(async () => { slowLoad.resolve(); await reading; });
  expect(planner.view.plan.revision).toBe(5);
  expect(ids(planner.view)).toEqual(expect.arrayContaining(['ECON 3300', 'ECON 4400']));

  await act(async () => { slowEdit.resolve(); await second; });
  expect(planner.view.plan.revision).toBe(6);
  expect(ids(planner.view)).toEqual(['CHEM 2410', 'ECON 3720', 'ECON 3300', 'ECON 4400']);
});

test('undo and redo with no answer poll the plan: applied when the pointer took the step, otherwise not', async () => {
  await mountLoaded();
  await act(async () => { await planner.edit([{ op: 'add', course: 'ECON 3300' }]); });

  // Undo is applied but its answer is lost: the first poll shows the step.
  server.once((req) => req.path === '/api/planner/undo', async (req, next) => { await next(); lost(); });
  let reads = server.sent('/api/planner/plan', 'GET').length;
  await act(async () => { await planner.undo(); });
  expect(server.sent('/api/planner/undo')).toHaveLength(1);
  expect(server.sent('/api/planner/plan', 'GET').length).toBe(reads + 1);
  expect(planner.view.plan.revision).toBe(6);
  expect(ids(planner.view)).not.toContain('ECON 3300');
  expect(planner.redoLabel).toBe('Redo: added ECON 3300');

  // Redo never reaches the server: three polls show it didn't apply.
  server.once((req) => req.path === '/api/planner/redo', async () => lost());
  reads = server.sent('/api/planner/plan', 'GET').length;
  let redo;
  act(() => { redo = planner.redo(); });
  await act(async () => { await expect(redo).rejects.toMatchObject({ network: true }); });
  expect(server.sent('/api/planner/redo')).toHaveLength(1);
  expect(server.sent('/api/planner/plan', 'GET').length).toBe(reads + 3);
  expect(planner.view.plan.revision).toBe(6);
  expect(planner.queueState).toBe('idle');

  await act(async () => { await planner.redo(); });
  expect(server.sent('/api/planner/redo').map((c) => c.body.expected_revision)).toEqual([6, 6]);
  expect(ids(planner.view)).toContain('ECON 3300');
});

test('an uncertain undo is not counted as applied just because another tab moved the revision', async () => {
  await mountLoaded();
  await act(async () => { await planner.edit([{ op: 'add', course: 'ECON 3300' }]); });
  server.once((req) => req.path === '/api/planner/undo', async () => {
    server.otherTab([{ op: 'add', course: 'HIST 1010' }]);
    lost();
  });
  let undo;
  act(() => { undo = planner.undo(); });
  await act(async () => { await expect(undo).rejects.toMatchObject({ network: true }); });
  expect(planner.view.plan.revision).toBe(6);
  expect(ids(planner.view)).toEqual(expect.arrayContaining(['ECON 3300', 'HIST 1010']));
});

test('accept with no answer: applied only once the plan moved and the proposal is no longer pending', async () => {
  server.proposal = proposal({ id: 'p1', base_revision: 4, ops: [{ op: 'add', course: 'ECON 3300' }] });
  await mountLoaded();

  // Another tab moves the plan while the accept is lost on the way: the
  // proposal is still pending, so it did not apply.
  server.once((req) => /accept$/.test(req.path), async () => {
    server.otherTab([{ op: 'add', course: 'HIST 1010' }]);
    lost();
  });
  await act(async () => { await planner.accept(server.proposal); });
  expect(planner.proposalState('p1')).toMatchObject({ status: 'ready', error: "Couldn't reach the planner. Try again." });
  expect(server.proposal).not.toBeNull();

  // This time it lands and the answer is lost.
  server.once((req) => /accept$/.test(req.path), async (req, next) => { await next(); lost(); });
  await act(async () => { await planner.accept(planner.pendingProposal); });
  expect(planner.proposalState('p1')).toMatchObject({ status: 'applied', revision: 6 });
  expect(planner.pendingProposal).toBeNull();
  expect(ids(planner.view)).toContain('ECON 3300');
});

test('an accept held with no answer at all shows as held, and Retry sends it again once it is known not applied', async () => {
  server.proposal = proposal({ id: 'p1', base_revision: 4, ops: [{ op: 'add', course: 'ECON 3300' }] });
  await mountLoaded();
  server.once((req) => /accept$/.test(req.path), async () => lost());
  server.times(3, isRead, async () => lost());
  let accepting;
  act(() => { accepting = planner.accept(server.proposal); });
  await act(async () => { expect(await accepting).toBeNull(); });
  expect(planner.proposalState('p1')).toMatchObject({ status: 'ready', held: true });
  expect(planner.queueState).toBe('error');

  await act(async () => { planner.retry(); });
  await waitFor(() => expect(planner.proposalState('p1')).toMatchObject({ status: 'applied', held: false }));
  expect(server.sent('/api/planner/proposals/p1/accept')).toHaveLength(2);
  expect(planner.queueState).toBe('idle');
});

test('a token change drops the queue: a held edit from one student is never sent with the next one\'s token', async () => {
  const { rerender } = await mountLoaded();
  server.times(4, isEdit, async () => lost());
  let held;
  let queued;
  act(() => {
    held = planner.edit([{ op: 'add', course: 'ECON 3300' }]);
    queued = planner.edit([{ op: 'add', course: 'ECON 4400' }]);
  });
  await act(async () => { await expect(held).rejects.toMatchObject({ held: true }); });
  expect(planner.queueHeld).toBe(true);

  mockToken = 'other-token';
  rerender(tree());
  await act(async () => { await expect(queued).rejects.toMatchObject({ code: 'session_ended' }); });
  expect(planner.queueState).toBe('idle');
  expect(planner.queueHeld).toBe(false);
  expect(planner.view).toBeNull();
  await act(async () => {
    window.dispatchEvent(new Event('online'));
    planner.retry();
  });
  await act(async () => { await planner.load(); });
  const edits = server.sent('/api/planner/edits');
  expect(edits).toHaveLength(4);
  expect(edits.every((c) => c.auth === 'Bearer token')).toBe(true);
  expect(ids(planner.view)).not.toContain('ECON 3300');

  // The new session's queue works.
  await act(async () => { await planner.edit([{ op: 'add', course: 'ECON 5500' }]); });
  expect(server.sent('/api/planner/edits').pop().auth).toBe('Bearer other-token');
});

test('a direct edit after the proposal was made marks it stale', async () => {
  server.proposal = proposal({ base_revision: 4 });
  await mountLoaded();
  expect(planner.pendingProposal).toMatchObject({ id: server.proposal.id, stale: false });
  await act(async () => { await planner.edit([{ op: 'remove', course: 'ECON 3720' }]); });
  expect(planner.pendingProposal).toMatchObject({ id: server.proposal.id, stale: true });
});

test('a read started before a local discard does not bring the discarded proposal back', async () => {
  server.proposal = proposal({ id: 'p1', base_revision: 4 });
  await mountLoaded();
  const slow = deferred();
  server.once(isRead, async (req, next) => {
    const answer = await next();
    await slow.promise;
    return answer;
  });
  let reading;
  act(() => { reading = planner.load({ fresh: true }); });
  await act(async () => { await planner.discard(planner.pendingProposal); });
  expect(planner.pendingProposal).toBeNull();
  await act(async () => { slow.resolve(); await reading; });
  expect(planner.pendingProposal).toBeNull();
  expect(planner.view.proposal).toBeNull();
});

test('the preview cache key tells terms and sections apart', async () => {
  const ops = [{ op: 'move', course: 'ECON 3010', to_term: 'Fall 2027', sections: ['002', '001'] }];
  const sameOps = [{ sections: ['001', '002'], to_term: 'Fall 2027', course: 'ECON 3010', op: 'move' }];
  expect(previewKey(ops, 4, 'Fall 2027')).toBe(previewKey(sameOps, 4, ' fall  2027'));
  expect(previewKey(ops, 4, 'Fall 2027')).not.toBe(previewKey(ops, 4, 'Spring 2027'));
  expect(previewKey(ops, 4, 'Fall 2027')).not.toBe(previewKey(ops, 5, 'Fall 2027'));
  expect(previewKey(ops, 4, 'Fall 2027'))
    .not.toBe(previewKey([{ ...ops[0], sections: ['003'] }], 4, 'Fall 2027'));

  await mountLoaded();
  let results;
  await act(async () => {
    results = await Promise.all([
      planner.preview(ops, 'Fall 2027'),
      planner.preview(sameOps, 'Fall 2027'),
      planner.preview(ops, 'Spring 2027'),
      planner.preview([{ ...ops[0], sections: ['003'] }], 'Fall 2027'),
    ]);
  });
  const sent = server.sent('/api/planner/preview');
  expect(sent).toHaveLength(3);
  expect(sent.map((c) => c.body.term)).toEqual(['Fall 2027', 'Spring 2027', 'Fall 2027']);
  expect(sent[0].body.expected_revision).toBe(4);
  expect(results[0].diff.heading).toBe('Preview for Fall 2027');
  expect(results[2].diff.heading).toBe('Preview for Spring 2027');

  // A new revision asks again.
  await act(async () => { await planner.edit([{ op: 'add', course: 'ECON 3300' }]); });
  await act(async () => { await planner.preview(ops, 'Fall 2027'); });
  expect(server.sent('/api/planner/preview')).toHaveLength(4);
});

const termReads = (term) => server.calls.filter((c) => c.method === 'GET' && c.query.get('term') === term);

test('viewFor fetches a term once per revision; degree is cached until the plan moves', async () => {
  server.courses.push({ id: 'ECON 3010', term: 'Fall 2027', sections: null });
  await mountLoaded();
  expect(planner.viewFor('Spring 2027')).toBe(planner.view);
  let fall;
  act(() => { fall = planner.viewFor('Fall 2027'); });
  expect(fall).toBeNull();
  await waitFor(() => expect(planner.viewFor('Fall 2027')?.report?.term).toBe('Fall 2027'));
  expect(ids(planner.viewFor('fall 2027'))).toEqual(['ECON 3010']);
  expect(termReads('Fall 2027')).toHaveLength(1);

  await act(async () => { await planner.refreshDegree(); });
  await act(async () => { await planner.refreshDegree(); });
  expect(planner.degree).toMatchObject({ revision: 4 });
  expect(server.sent('/api/planner/degree', 'GET')).toHaveLength(1);
  await act(async () => { await planner.edit([{ op: 'add', course: 'ECON 3300' }]); });
  await act(async () => { await planner.refreshDegree(); });
  expect(planner.degree).toMatchObject({ revision: 5 });
});

test('viewFor keeps a landed edit on a term view until that term\'s refetch catches up', async () => {
  await mountLoaded();
  act(() => { planner.viewFor('Fall 2027'); });
  await waitFor(() => expect(planner.viewFor('Fall 2027')?.report?.term).toBe('Fall 2027'));
  expect(ids(planner.viewFor('Fall 2027'))).toEqual([]);

  const slow = deferred();
  server.once((req) => isRead(req) && req.query.get('term') === 'Fall 2027', async (req, next) => {
    await slow.promise;
    return next();
  });
  await act(async () => { await planner.edit([{ op: 'add', course: 'ECON 3010', term: 'Fall 2027' }]); });
  // The term view is still revision 4, but the landed add shows on it.
  let fall;
  act(() => { fall = planner.viewFor('Fall 2027'); });
  expect(ids(fall)).toEqual(['ECON 3010']);
  expect(planner.queueState).toBe('idle');

  await act(async () => { slow.resolve(); });
  await waitFor(() => expect(planner.viewFor('Fall 2027')?.report?.courses?.[0]?.title).toBe('Course ECON 3010'));
  expect(ids(planner.viewFor('Fall 2027'))).toEqual(['ECON 3010']);
});

test('a failed term fetch is reported, not cached and not refetched in a loop; reloadTerm tries again', async () => {
  await mountLoaded();
  server.once((req) => isRead(req) && req.query.get('term') === 'Fall 2027', async () => down());
  act(() => { planner.viewFor('Fall 2027'); });
  await waitFor(() => expect(planner.termError('Fall 2027')).toMatchObject({ status: 503 }));
  expect(planner.viewFor('Fall 2027')).toBeNull();
  // Give a refetch loop time to show itself.
  await act(() => new Promise((resolve) => { setTimeout(resolve, 30); }));
  expect(termReads('Fall 2027')).toHaveLength(1);

  await act(async () => { await planner.reloadTerm('Fall 2027'); });
  expect(planner.termError('Fall 2027')).toBeNull();
  expect(planner.viewFor('Fall 2027')?.report?.term).toBe('Fall 2027');
  expect(termReads('Fall 2027')).toHaveLength(2);
});

test('applyOps is idempotent, so replaying a landed edit changes nothing', () => {
  const view = { plan: plan(), report: report() };
  const once = applyOps(view, [{ op: 'add', course: 'ECON 3300' }, { op: 'remove', course: 'CHEM 2410' }]);
  const twice = applyOps(once, [{ op: 'add', course: 'ECON 3300' }, { op: 'remove', course: 'CHEM 2410' }]);
  expect(twice.plan.courses).toEqual(once.plan.courses);
  expect(twice.report.courses.map((c) => c.id)).toEqual(['ECON 3720', 'ECON 3010', 'ECON 3300']);
  const moved = applyOps(view, [{ op: 'move', course: 'ECON 3010', to_term: 'Fall 2027' }]);
  expect(moved.report.courses.map((c) => c.id)).toEqual(['CHEM 2410', 'ECON 3720']);
  expect(moved.plan.courses.find((c) => c.id === 'ECON 3010').term).toBe('Fall 2027');
});
