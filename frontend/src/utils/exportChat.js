/**
 * Export and share a chat (the ⋯ menu's Export and Share, the header's
 * Share button).
 */

/** The conversation as plain text: the title, then each question and answer. */
export function chatText({ title, messages = [] }) {
  const lines = messages
    .filter((m) => m.type === 'user' || m.type === 'advisor')
    .map((m) => (m.type === 'user' ? `Q: ${m.content || ''}` : (m.compact_markdown || m.content || '')));
  return [title, ...lines].filter(Boolean).join('\n\n');
}

/**
 * Share through the device's share sheet when there is one, else copy the
 * text. Resolves 'shared', 'copied' or 'cancelled'; rejects when neither works.
 */
export async function shareChat({ title, messages }) {
  const text = chatText({ title, messages });
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text });
      return 'shared';
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled';
    }
  }
  await navigator.clipboard.writeText(text);
  return 'copied';
}

/** Download the chat as 'pdf' or 'docx' (GET /export-chat). Rejects on failure. */
export async function exportChat({ format, sessionId, authToken }) {
  const params = new URLSearchParams({ format });
  if (sessionId) params.set('chat_session_id', sessionId);
  const response = await fetch(`${process.env.REACT_APP_API_URL}/export-chat?${params}`, {
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
  });
  if (!response.ok) throw new Error(`Export failed with status ${response.status}`);

  let filename = `chat.${format}`;
  const disposition = response.headers.get('Content-Disposition');
  const match = disposition?.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
  if (match?.[1]) filename = match[1].replace(/['"]/g, '');

  const url = window.URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
