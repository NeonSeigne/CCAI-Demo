import React from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../icons';
import { PhoneSheet } from '../../modules/sheet';
import { hasPhysicalLocation, walkText } from '../../modules/campus';
import { useSaved } from '../../contexts/SavedContext';
import { useToast } from '../Toast';
import useAsk from '../../hooks/useAsk';
import { downloadEventIcs } from '../../utils/ics';
import { placeName } from './eventKind';
import '../../styles/EventsPage.css';

/**
 * A phone row's actions (mockup "Event actions on phone"): Directions with
 * the walk, Add to calendar, Save / Saved, Ask about this and Share, as a
 * bottom sheet. An action the event can't take is left out (no Directions
 * without a matched place, no Share where the browser has none).
 *
 * Props: event (null closes it), onClose().
 */
export default function EventActionsSheet({ event, onClose }) {
  const saved = useSaved();
  const toast = useToast();
  const ask = useAsk();
  if (!event) return null;

  const physical = hasPhysicalLocation(event.location);
  const walk = physical ? walkText(event.walk_minutes) : null;
  const on = Boolean(saved && event.id && saved.isSaved('event', event.id));
  const canShare = Boolean(event.url) && typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const toggleSave = () => {
    const done = on
      ? saved.unsave('event', event.id).then(() => toast.show({ message: 'Removed' }))
      : saved.save({
        kind: 'event', key: event.id, display_name: event.title, event_start: event.start, event_end: event.end,
      }).then(() => toast.show({ message: 'Saved to Unsorted', actions: [{ label: 'Move', to: '/saved' }] }));
    done.catch(() => toast.show({ message: on ? "Couldn't remove" : "Couldn't save", tone: 'error' }));
    onClose();
  };

  const titleId = 'ev-actions-title';
  return (
    <PhoneSheet open onClose={onClose} labelledBy={titleId}>
      <div className="ev-actions-sheet">
        <span className="ev-actions-grab" aria-hidden="true" />
        <h2 id={titleId} className="sr-only">{event.title}</h2>
        <ul className="ev-actions-menu">
          {event.place_id && physical && (
            <li>
              <Link className="ev-actions-item" to={`/map?to=${encodeURIComponent(event.place_id)}`} onClick={onClose}>
                <Icon name="directions_walk" size={21} />
                <span>Directions</span>
                {walk && <span className="ev-actions-value">{walk}</span>}
              </Link>
            </li>
          )}
          {event.start && (
            <li>
              <button type="button" className="ev-actions-item" onClick={() => { downloadEventIcs(event); onClose(); }}>
                <Icon name="calendar_add_on" size={21} />
                <span>Add to calendar</span>
              </button>
            </li>
          )}
          {saved && event.id && (
            <li>
              <button
                type="button"
                className={`ev-actions-item ${on ? 'is-on' : ''}`.trim()}
                aria-pressed={on}
                onClick={toggleSave}
              >
                <Icon name="bookmark" size={21} filled={on} />
                <span>{on ? 'Saved' : 'Save'}</span>
              </button>
            </li>
          )}
          {event.id && (
            <li>
              <button
                type="button"
                className="ev-actions-item"
                onClick={() => { onClose(); ask({ type: 'event', id: event.id, title: event.title }); }}
              >
                <Icon name="forum" size={21} />
                <span>Ask about this</span>
              </button>
            </li>
          )}
          {canShare && (
            <li>
              <button
                type="button"
                className="ev-actions-item"
                onClick={() => {
                  navigator.share({ title: event.title, text: placeName(event) || undefined, url: event.url }).catch(() => {});
                  onClose();
                }}
              >
                <Icon name="share" size={21} />
                <span>Share</span>
              </button>
            </li>
          )}
        </ul>
      </div>
    </PhoneSheet>
  );
}
