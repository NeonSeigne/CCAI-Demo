const API_URL = process.env.REACT_APP_API_URL || '';

export class CourseApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'CourseApiError';
    this.status = status;
  }
}

export async function fetchCourseDetail(identifier, { token, term, signal } = {}) {
  const path = `/api/courses/${encodeURIComponent(identifier.trim())}`;
  const query = term ? `?term=${encodeURIComponent(term)}` : '';
  const response = await fetch(`${API_URL}${path}${query}`, {
    signal,
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    let message = response.status === 404
      ? 'We could not find that course.'
      : 'Course details are unavailable right now.';
    try {
      const body = await response.json();
      if (typeof body?.detail === 'string') message = body.detail;
    } catch {
      // Keep the friendly fallback when the upstream response is not JSON.
    }
    throw new CourseApiError(message, response.status);
  }

  return response.json();
}
