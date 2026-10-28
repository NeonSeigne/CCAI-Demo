/**
 * Client for the semester planner (`/api/planner`, signed-in, no LLM).
 *
 * Same conventions as `api/campus.js`: the auth token comes first, an
 * optional `{signal}` last, and a non-2xx response throws an `ApiError`.
 * The planner's 409 and 422 bodies arrive as FastAPI `detail` objects;
 * `plannerError(error)` reads them into one shape:
 *
 *   {kind: 'conflict', revision}              revision_conflict (another window)
 *   {kind: 'needs_review', proposal}          accept: the plan moved, check again
 *   {kind: 'refused', reason}                 accept/undo can't go ahead
 *   {kind: 'edit', code, message, course}     422 unknown_course, couldnt_verify_course, ...
 *   {kind: 'unavailable'} / {kind: 'other'}   network, 5xx, anything else
 */
import { ApiError, request } from './campus';

export { ApiError };

const query = (params = {}) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : '';
};

const path = (value) => encodeURIComponent(String(value));

/** GET the plan view: `{plan, report, proposal: {…, diff}|null, undo_label}`. */
export const getPlan = (token, options) => request(token, '/api/planner/plan', options);

/** GET the school's program files: `[{id, name, type}]`. */
export const listPrograms = async (token, options) => {
  const data = await request(token, '/api/planner/programs', options);
  return Array.isArray(data) ? data : [];
};

/** The student's own edit: resolves to `{plan, report, undo_label, notes}`. */
export const postEdits = (token, { ops, expected_revision, idempotency_key }, options) =>
  request(token, '/api/planner/edits', {
    ...options,
    method: 'POST',
    body: { ops, expected_revision, idempotency_key },
  });

/** Store `ops` as the one pending proposal: resolves to `{proposal}` (with its diff). */
export const createProposal = (token, { ops, expected_revision }, options) =>
  request(token, '/api/planner/proposals', { ...options, method: 'POST', body: { ops, expected_revision } });

/** Apply a pending proposal: resolves to `{plan, report}`. */
export const acceptProposal = (token, id, options) =>
  request(token, `/api/planner/proposals/${path(id)}/accept`, { ...options, method: 'POST', body: {} });

/** Resolves to `{proposal}` with status "discarded". */
export const discardProposal = (token, id, options) =>
  request(token, `/api/planner/proposals/${path(id)}/discard`, { ...options, method: 'POST' });

/** Walk back the latest edit: resolves to `{plan, report, undo_label}`. */
export const undoEdit = (token, { expected_revision }, options) =>
  request(token, '/api/planner/undo', { ...options, method: 'POST', body: { expected_revision } });

/** Up to five labelled courses: resolves to `{items, reason}`. */
export const getSuggestions = (token, { q, term } = {}, options) =>
  request(token, `/api/planner/suggestions${query({ q, term })}`, options);

/** A fresh key so a retried edit applies once. */
export const newIdempotencyKey = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `edit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

/** Read a planner error into `{kind, ...}` (see the module comment). */
export function plannerError(error) {
  if (!error) return { kind: 'other' };
  const body = error.body && typeof error.body === 'object' ? error.body : null;
  const detail = body && typeof body.detail === 'object' && body.detail ? body.detail : body;
  if (error.status === 409 && detail) {
    if (detail.code === 'revision_conflict') return { kind: 'conflict', revision: detail.revision ?? null };
    if (detail.status === 'needs_review') return { kind: 'needs_review', proposal: detail.proposal || null };
    if (detail.status === 'refused') return { kind: 'refused', reason: detail.reason || null };
  }
  if (error.status === 422 && detail && detail.code) {
    return { kind: 'edit', code: detail.code, message: detail.message || null, course: detail.course || null };
  }
  if (error.network || error.status >= 500) return { kind: 'unavailable' };
  return { kind: 'other', message: error.message };
}
