/**
 * Thin client for the campus pages' endpoints (signed-in, no LLM).
 *
 * Every function takes the auth token first and resolves to the parsed JSON
 * body. A non-2xx response throws an `ApiError` carrying `status` (404, 503,
 * ...); a network failure throws one with `status: 0` and `network: true`, so
 * callers can tell "not found" from "couldn't check right now".
 */

const API_URL = process.env.REACT_APP_API_URL || '';

export class ApiError extends Error {
  constructor(message, { status = 0, body = null, network = false } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    this.network = network;
  }

  get notFound() { return this.status === 404; }

  get unavailable() { return this.network || this.status >= 500; }
}

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

/** fetch with the Bearer token; JSON in and out. */
export async function request(token, url, { method = 'GET', body, signal } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(`${API_URL}${url}`, {
      method,
      headers,
      signal,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ApiError('Network request failed', { network: true });
  }

  const text = await response.text().catch(() => '');
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!response.ok) {
    const detail = data && typeof data === 'object' ? data.detail || data.error : null;
    throw new ApiError(typeof detail === 'string' ? detail : `HTTP ${response.status}`, {
      status: response.status,
      body: data,
    });
  }
  return data;
}

// ---- Courses ----------------------------------------------------------------
export const searchCatalog = (token, { q, level, open_only, limit } = {}, options) =>
  request(token, `/api/catalog/search${query({ q, level, open_only, limit })}`, options);
export const getCatalogStarters = (token, options) => request(token, '/api/catalog/starters', options);
export const getCatalogCourse = (token, id, options) => request(token, `/api/catalog/${path(id)}`, options);

// ---- Events -----------------------------------------------------------------
export const listEvents = (token, { window, q, from } = {}, options) =>
  request(token, `/api/events${query({ window, q, from })}`, options);
/** `from` (a place id) adds walk_minutes when the event's venue is on campus. */
export const getEvent = (token, id, { from, ...options } = {}) =>
  request(token, `/api/events/${path(id)}${query({ from })}`, options);

// ---- Places and routes ------------------------------------------------------
export const listPlaces = (token, { category, q, from, limit } = {}, options) =>
  request(token, `/api/places${query({ category, q, from, limit })}`, options);
/** `from` (a place id) adds walk_minutes. */
export const getPlace = (token, id, { from, ...options } = {}) =>
  request(token, `/api/places/${path(id)}${query({ from })}`, options);
export const getRoute = (token, { from, to }, options) =>
  request(token, `/api/route${query({ from, to })}`, options);

// ---- Start place ------------------------------------------------------------
export const getCampusOrigin = (token, options) => request(token, '/api/me/campus-origin', options);
export const setCampusOrigin = (token, placeId, options) =>
  request(token, '/api/me/campus-origin', { ...options, method: 'PUT', body: { place_id: placeId } });

// ---- Saved items ------------------------------------------------------------
/** GET /api/saved; resolves to the item list whether the body is a list or `{items}`. */
export const listSaved = async (token, params = {}, options) => {
  const data = await request(token, `/api/saved${query(params)}`, options);
  if (Array.isArray(data)) return data;
  return Array.isArray(data?.items) ? data.items : [];
};
/** POST {kind, key, display_name, event_start?, event_end?, collection_id?}; resolves to the stored item. */
export const createSaved = (token, item, options) =>
  request(token, '/api/saved', { ...options, method: 'POST', body: item });
export const deleteSaved = (token, id, options) =>
  request(token, `/api/saved/${path(id)}`, { ...options, method: 'DELETE' });
/** PATCH a saved item, e.g. `{collection_id}` to move it (null = Unsorted). */
export const updateSaved = (token, id, changes, options) =>
  request(token, `/api/saved/${path(id)}`, { ...options, method: 'PATCH', body: changes });

// ---- Collections ------------------------------------------------------------
export const listCollections = (token, options) => request(token, '/api/saved/collections', options);
export const createCollection = (token, collection, options) =>
  request(token, '/api/saved/collections', { ...options, method: 'POST', body: collection });
export const updateCollection = (token, id, changes, options) =>
  request(token, `/api/saved/collections/${path(id)}`, { ...options, method: 'PATCH', body: changes });
export const deleteCollection = (token, id, options) =>
  request(token, `/api/saved/collections/${path(id)}`, { ...options, method: 'DELETE' });
