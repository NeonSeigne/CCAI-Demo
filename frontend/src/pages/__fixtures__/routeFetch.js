/**
 * `global.fetch` stand-in for tests: the first route whose pattern matches
 * the URL answers. A route's reply is `{status?, body}` or a function of
 * `(url, init)` returning one. Unmatched URLs answer 404.
 */
export function routeFetch(routes) {
  return jest.fn(async (url, init = {}) => {
    const route = routes.find(([pattern]) => (
      typeof pattern === 'string' ? String(url).includes(pattern) : pattern.test(String(url))
    ));
    const reply = route ? (typeof route[1] === 'function' ? route[1](url, init) : route[1]) : { status: 404, body: { detail: 'Not Found' } };
    if (reply instanceof Error) throw reply;
    const status = reply.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(reply.body ?? null),
    };
  });
}
