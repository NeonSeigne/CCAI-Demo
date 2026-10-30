/**
 * Chat sessions (`/api/chat-sessions`): rename, pin, delete and answer
 * feedback. Same conventions as `api/campus.js`: the token first, and a
 * non-2xx response throws an `ApiError`.
 */
import { request } from './campus';

const path = (value) => encodeURIComponent(String(value));

/** PUT a new title (trimmed by the server, 1–200 characters). */
export const renameChat = (token, id, title) => request(token, `/api/chat-sessions/${path(id)}`, {
  method: 'PUT', body: { title },
});

/** PUT pinned true/false; pinned chats lead Recent. */
export const setChatPinned = (token, id, pinned) => request(token, `/api/chat-sessions/${path(id)}`, {
  method: 'PUT', body: { pinned: Boolean(pinned) },
});

/** DELETE a chat. */
export const deleteChat = (token, id) => request(token, `/api/chat-sessions/${path(id)}`, { method: 'DELETE' });

/** PUT thumbs on an answer: 'up' | 'down' | null (null clears it). */
export const setAnswerFeedback = (token, sessionId, messageId, feedback) => request(
  token,
  `/api/chat-sessions/${path(sessionId)}/messages/${path(messageId)}/feedback`,
  { method: 'PUT', body: { feedback } },
);
