import { useCallback, useEffect, useRef } from 'react';
import { useChatDock } from '../contexts/ChatDockContext';
import useAsk from './useAsk';

/**
 * Ask from a pop-up. With the chat dock beside the page, the pop-up stays
 * open and the item goes to the dock (D3). Where there is no dock (/chat,
 * /home) the composer is behind the pop-up's scrim, so the pop-up closes
 * first and the ask runs once it has gone, after the dialog has handed focus
 * back, so focus lands on a visible composer.
 *
 * `open` is the pop-up's current value (its id); `close` closes it.
 */
export default function usePopupAsk(open, close) {
  const ask = useAsk();
  const dock = useChatDock();
  const pending = useRef(null);

  useEffect(() => {
    if (open || !pending.current) return;
    const item = pending.current;
    pending.current = null;
    ask(item);
  }, [open, ask]);

  return useCallback((item) => {
    if (dock?.available) {
      ask(item);
      return;
    }
    pending.current = item;
    close();
  }, [ask, dock, close]);
}
