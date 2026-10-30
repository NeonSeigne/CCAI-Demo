import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useChat } from '../contexts/ChatContext';
import { useChatDock } from '../contexts/ChatDockContext';

/**
 * ask(item): attach a course, event or place to the chat box, open the dock
 * (or drawer / sheet) and focus the composer. It never sends (eng R9, D18).
 *
 * item: { type: 'course' | 'event' | 'place', id, title, extra? }
 *
 * Where the dock is hidden, the chat page's own composer takes the chip
 * (/chat), or the chat page opens (/home).
 */
export default function useAsk() {
  const chat = useChat();
  const dock = useChatDock();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return useCallback((item) => {
    chat.attach(item);
    if (dock?.available) dock.openDock();
    else if (pathname !== '/chat') navigate('/chat');
    // The composer on screen takes the request (components/chat/Composer.js).
    dock?.requestComposerFocus();
  }, [chat, dock, navigate, pathname]);
}
