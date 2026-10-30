import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/icons';
import ConfirmDialog from '../components/ConfirmDialog';
import PanelState from '../components/panel/PanelState';
import SavedRowMenu from '../components/saved/SavedRowMenu';
import { useToast } from '../components/Toast';
import {
  clockTime as campusClock, dateLabel, eventRange as formatEventRange, eventTime, isAllDay, useSchool,
  useStartPlace, walkText,
} from '../modules/campus';
import { PHONE_SHEET, PhoneSheet } from '../modules/sheet';
import useMediaMatch from '../hooks/useMediaMatch';
import { useAuth } from '../contexts/AuthContext';
import { useSaved } from '../contexts/SavedContext';
import {
  createCollection,
  createSaved,
  deleteCollection,
  deleteSaved,
  getEvent,
  getPlace,
  listCollections,
  listSaved,
  updateCollection,
  updateSaved,
} from '../api/campus';
import { loadCourse } from '../modules/course';
import { downloadEventIcs } from '../utils/ics';
import '../styles/SavedPage.css';

export const UNSORTED = 'unsorted';
/** Each live lookup gets 5 s (R8). */
export const LOOKUP_TIMEOUT_MS = 5000;
const COMPARE_MIN = 2;
const COMPARE_MAX = 4;

// Courses come from the shared course cache; events and places carry walk minutes from the start place.
const LOOKUPS = { course: (token, id) => loadCourse(token, id), event: getEvent, place: getPlace };
const KIND_WORDS = { course: ['course', 'courses'], event: ['event', 'events'], place: ['place', 'places'] };

const plural = (count, [one, many]) => `${count} ${count === 1 ? one : many}`;
const itemName = (item) => item.display_name || item.key;
const time = (iso) => {
  const value = iso ? new Date(iso).getTime() : NaN;
  return Number.isNaN(value) ? null : value;
};

/** The item's known end: the live event's, else the one stored at save time (DO3). */
const knownEnd = (item, lookup) => time(lookup?.state === 'ok' ? lookup.data?.end : null) ?? time(item.event_end);
const isPast = (item, lookup, now) => {
  if (item.kind !== 'event') return false;
  const end = knownEnd(item, lookup);
  return end !== null && end < now;
};

const kindSummary = (items) => {
  if (items.length === 0) return 'Empty';
  const counts = {};
  items.forEach((item) => { counts[item.kind] = (counts[item.kind] || 0) + 1; });
  return Object.entries(counts)
    .map(([kind, count]) => plural(count, KIND_WORDS[kind] || ['item', 'items']))
    .join(' · ');
};

const dayLabel = (iso, timezone) => dateLabel(iso, timezone, { weekday: 'short', month: 'short', day: 'numeric' });

function Walk({ minutes }) {
  const walk = walkText(minutes, { suffix: ' walk' });
  if (!walk) return null; // no walk time: leave it out (D7)
  return (
    <span className="saved-walk">
      <Icon name="directions_walk" size={16} />
      {walk}
    </span>
  );
}

/** A ghost round icon button in a row's actions: 40px drawn, 44px to tap. */
function RowAction({
  icon, label, to, onClick,
}) {
  if (to) {
    return (
      <Link className="saved-icon-btn" to={to} aria-label={label}>
        <Icon name={icon} size={22} />
      </Link>
    );
  }
  return (
    <button type="button" className="saved-icon-btn" aria-label={label} onClick={onClick}>
      <Icon name={icon} size={22} />
    </button>
  );
}

const gradeLine = (grades) => {
  if (!grades || grades.gpa == null) return null;
  const parts = [`${Number(grades.gpa).toFixed(2)} GPA${grades.term ? `, ${grades.term}` : ''}`];
  if (grades.pct_df != null) {
    const which = grades.labels?.df === 'DFW' ? 'D, F or W' : 'D or F';
    parts.push(`${Math.round(grades.pct_df)}% ${which}`);
  }
  return parts.join(' · ');
};

/** open_until is a full ISO datetime; show it as a clock time. */
const clockTime = (value, timezone) => campusClock(value, timezone) || value;

const hoursText = (place, timezone) => {
  if (place.open_now && place.open_until) return `Open until ${clockTime(place.open_until, timezone)}`;
  if (place.open_now === true) return 'Open now';
  const listed = typeof place.hours === 'string' && place.hours ? place.hours : null;
  if (place.open_now === false) return listed ? `Closed · ${listed}` : 'Closed now';
  return listed; // null: no hours line (D7)
};

// ---- Rows -------------------------------------------------------------------

/*
 * Each kind fills the row's four columns (phase9 saved.html): the key column
 * (course code, event time and day, or a place pin), the title with its
 * meta line, an optional tag, and the actions.
 */

function placeholderParts(item) {
  return {
    body: (
      <div className="saved-row-w" aria-busy="true">
        <span className="sr-only">Checking {itemName(item)}…</span>
        <span className="saved-ph" aria-hidden="true">
          <span className="pnl-block saved-ph-bar is-short" />
          <span className="pnl-block saved-ph-bar" />
        </span>
      </div>
    ),
  };
}

function courseParts(course) {
  const code = course.identifier;
  const grade = gradeLine(course.grades);
  const seats = course.sections?.seats_open;
  return {
    key: <span className="saved-code">{code}</span>,
    body: (
      <div className="saved-row-w">
        <strong>{course.title}</strong>
        {grade && <span className="saved-meta">{grade}</span>}
      </div>
    ),
    tag: seats != null ? (
      <span className="saved-tag">
        {seats} {course.sections.term ? `${course.sections.term} ` : ''}{seats === 1 ? 'seat' : 'seats'}
      </span>
    ) : null,
    action: <RowAction icon="open_in_new" label={`Course page for ${code}`} to={`/courses?selected=${encodeURIComponent(code)}`} />,
  };
}

function eventParts(event, timezone) {
  return {
    key: event.start ? (
      <span className="saved-when">
        <span className="saved-time">{isAllDay(event) ? formatEventRange(event, timezone) : eventTime(event, timezone)}</span>
        <small>{dayLabel(event.start, timezone)}</small>
      </span>
    ) : <span className="saved-when"><small>Date not listed</small></span>,
    body: (
      <div className="saved-row-w">
        <strong>{event.title}</strong>
        <span className="saved-meta">
          {event.location && <span>{event.location}</span>}
          {/* Only a venue on the campus map has a walk; off-campus and online ones show none. */}
          {event.place_id && <Walk minutes={event.walk_minutes} />}
        </span>
      </div>
    ),
    action: <RowAction icon="calendar_add_on" label={`Add ${event.title} to calendar`} onClick={() => downloadEventIcs(event)} />,
  };
}

function placeParts(place, timezone) {
  return {
    key: <Icon name="location_on" size={22} filled className="saved-pin" />,
    body: (
      <div className="saved-row-w">
        <strong>{place.name}</strong>
        <span className="saved-meta">
          {hoursText(place, timezone) && <span>{hoursText(place, timezone)}</span>}
          <Walk minutes={place.walk_minutes} />
        </span>
      </div>
    ),
    action: <RowAction icon="directions" label={`Directions to ${place.name}`} to={`/map?to=${encodeURIComponent(place.id)}`} />,
  };
}

function fallbackParts(item, label, action = null) {
  return {
    body: (
      <div className="saved-row-w">
        <strong>{itemName(item)}</strong>
        <span className="saved-meta saved-status">{label}</span>
      </div>
    ),
    action,
  };
}

function SavedRow({ item, lookup, past, timezone, menu, onRetry, onRemove }) {
  const name = itemName(item);
  let parts;
  if (past) {
    parts = fallbackParts(item, item.event_start ? `Ended · ${dayLabel(item.event_start, timezone)}` : 'Ended');
  } else if (!lookup || lookup.state === 'loading') {
    parts = placeholderParts(item);
  } else if (lookup.state === 'gone') {
    parts = fallbackParts(item, 'No longer listed', (
      <button type="button" className="cc-btn cc-btn-ghost saved-text-btn" aria-label={`Remove ${name}`} onClick={onRemove}>Remove</button>
    ));
  } else if (lookup.state === 'unavailable') {
    parts = fallbackParts(item, "Couldn't check right now", (
      <button type="button" className="cc-btn cc-btn-ghost saved-text-btn" aria-label={`Retry checking ${name}`} onClick={onRetry}>
        <Icon name="refresh" size={18} /> Retry
      </button>
    ));
  } else if (item.kind === 'course') {
    parts = courseParts({ identifier: item.key, ...lookup.data });
  } else if (item.kind === 'event') {
    parts = eventParts({ id: item.key, title: name, ...lookup.data }, timezone);
  } else if (item.kind === 'place') {
    parts = placeParts({ id: item.key, name, ...lookup.data }, timezone);
  } else {
    parts = fallbackParts(item, 'Saved item');
  }
  return (
    <li className={`saved-row is-${item.kind}`} data-testid={`saved-row-${item.key}`}>
      <div className="saved-row-k">{parts.key}</div>
      {parts.body}
      <div className="saved-row-tag">{parts.tag}</div>
      <div className="saved-acts">
        {parts.action}
        {menu}
      </div>
    </li>
  );
}

// ---- Inline name form (New collection, Rename) ------------------------------

function NameForm({ id, label, initial = '', submitLabel, onSubmit, onCancel }) {
  const [value, setValue] = useState(initial);
  const input = useRef(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  return (
    <form
      className="saved-inline-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (value.trim()) onSubmit(value.trim());
      }}
    >
      <label htmlFor={id} className="sr-only">{label}</label>
      <input
        id={id}
        ref={input}
        value={value}
        maxLength={60}
        placeholder="Collection name"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          }
        }}
      />
      <button type="submit" className="cc-btn cc-btn-primary" disabled={!value.trim()}>{submitLabel}</button>
      <button type="button" className="cc-btn" onClick={onCancel}>Cancel</button>
    </form>
  );
}

// ---- Page -------------------------------------------------------------------

/**
 * Saved (designs 2A, 3A, 17A-19A): the collection list on the left (Unsorted
 * first), the selected collection's items on the right. Every item is looked
 * up live, concurrently and with a 5 s limit each (R5, R8); the name stored at
 * save time stands in when the lookup can't resolve it (18A).
 */
const SavedPage = ({ lookupTimeout = LOOKUP_TIMEOUT_MS }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { authToken } = useAuth();
  const { timezone } = useSchool();
  const start = useStartPlace();
  const startReady = start.status !== 'loading';
  const savedContext = useSaved();
  const toast = useToast();

  const [status, setStatus] = useState('loading');
  const [items, setItems] = useState([]);
  const [collections, setCollections] = useState([]);
  const [lookups, setLookups] = useState({});
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pastOpen, setPastOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const phone = useMediaMatch(PHONE_SHEET);
  const newButton = useRef(null);
  const renameButton = useRef(null);
  const controllers = useRef(new Map());
  const started = useRef(new Set());
  const originId = useRef(null);
  const loadRun = useRef(0);

  const syncRail = () => savedContext?.reload?.();

  // ---- Load ----
  const load = useCallback(() => {
    const run = loadRun.current + 1;
    loadRun.current = run;
    setStatus('loading');
    Promise.all([
      listSaved(authToken),
      listCollections(authToken),
    ])
      .then(([list, cols]) => {
        if (loadRun.current !== run) return;
        setItems(Array.isArray(list) ? list : []);
        setCollections(Array.isArray(cols) ? cols : cols?.collections || []);
        setStatus('ready');
      })
      .catch(() => {
        if (loadRun.current === run) setStatus('error');
      });
  }, [authToken]);

  // Walk times are measured from the student's starting place; without it rows just say unavailable.
  originId.current = start.id;
  useEffect(() => {
    if (authToken && startReady) load();
  }, [authToken, startReady, load]);

  // ---- Live lookups (R5, R8) ----
  const resolve = useCallback((item) => {
    const fetcher = LOOKUPS[item.kind];
    if (!fetcher) return;
    controllers.current.get(item.id)?.abort();
    const controller = new AbortController();
    controllers.current.set(item.id, controller);
    const settle = (result) => {
      if (controller.signal.aborted) return;
      clearTimeout(timer);
      controllers.current.delete(item.id);
      setLookups((current) => ({ ...current, [item.id]: result }));
    };
    const timer = setTimeout(() => {
      settle({ state: 'unavailable' });
      controller.abort();
    }, lookupTimeout);
    setLookups((current) => ({ ...current, [item.id]: { state: 'loading' } }));
    Promise.resolve()
      .then(() => fetcher(authToken, item.key, { signal: controller.signal, from: originId.current || undefined }))
      // Events and places come wrapped ({event}, {place}); course summaries do not.
      .then((data) => settle({ state: 'ok', data: data?.[item.kind] || data || {} }))
      // Only a confirmed 404 means the item is gone; timeouts, 5xx and network errors may pass.
      .catch((error) => settle({ state: error?.notFound ? 'gone' : 'unavailable' }));
  }, [authToken, lookupTimeout]);

  useEffect(() => {
    if (status !== 'ready') return;
    const now = Date.now();
    items.forEach((item) => {
      if (started.current.has(item.id) || isPast(item, null, now)) return;
      started.current.add(item.id);
      resolve(item);
    });
  }, [items, status, resolve]);

  useEffect(() => {
    const running = controllers.current;
    return () => running.forEach((controller) => controller.abort());
  }, []);

  // ---- Homes, counts and selection (2A, DO1) ----
  const collectionIds = useMemo(() => new Set(collections.map((c) => c.id)), [collections]);
  const homeOf = useCallback(
    (item) => (item.collection_id && collectionIds.has(item.collection_id) ? item.collection_id : UNSORTED),
    [collectionIds],
  );
  const counts = useMemo(() => {
    const result = { [UNSORTED]: 0 };
    collections.forEach((c) => { result[c.id] = 0; });
    items.forEach((item) => { result[homeOf(item)] = (result[homeOf(item)] || 0) + 1; });
    return result;
  }, [items, collections, homeOf]);

  const param = searchParams.get('collection');
  const selected = useMemo(() => {
    if (param === UNSORTED || (param && collectionIds.has(param))) return param;
    if (counts[UNSORTED] > 0 || collections.length === 0) return UNSORTED;
    // Otherwise the most recently used collection: the one holding the newest save.
    const newest = [...items].sort((a, b) => (time(b.saved_at) || 0) - (time(a.saved_at) || 0))[0];
    if (newest) return homeOf(newest);
    return [...collections].sort((a, b) => (time(b.created_at) || 0) - (time(a.created_at) || 0))[0].id;
  }, [param, collectionIds, counts, collections, items, homeOf]);

  const select = (id) => {
    setRenaming(false);
    setPastOpen(false);
    setPickerOpen(false);
    setSearchParams({ collection: id }, { replace: false });
  };

  const selectedCollection = collections.find((c) => c.id === selected) || null;
  const selectedName = selectedCollection ? selectedCollection.name : 'Unsorted';
  const now = Date.now();
  const inSelected = items.filter((item) => homeOf(item) === selected);
  const current = inSelected.filter((item) => !isPast(item, lookups[item.id], now));
  const past = inSelected.filter((item) => isPast(item, lookups[item.id], now));
  const courseKeys = inSelected.filter((item) => item.kind === 'course').map((item) => item.key);
  const canCompare = courseKeys.length >= COMPARE_MIN && courseKeys.length <= COMPARE_MAX;
  const homes = [{ id: UNSORTED, name: 'Unsorted' }, ...collections.map((c) => ({ id: c.id, name: c.name }))];

  // ---- Mutations ----
  const failed = (message, retry) => toast.show({
    message, tone: 'error', actions: retry ? [{ label: 'Retry', onClick: retry }] : [],
  });

  const restore = (removed) => {
    Promise.all(removed.map((item) => createSaved(authToken, {
      kind: item.kind,
      key: item.key,
      display_name: item.display_name,
      ...(item.event_start ? { event_start: item.event_start } : {}),
      ...(item.event_end ? { event_end: item.event_end } : {}),
      ...(item.collection_id ? { collection_id: item.collection_id } : {}),
    })))
      .then(() => {
        load();
        syncRail();
      })
      .catch(() => failed("Couldn't restore", () => restore(removed)));
  };

  const remove = (item) => {
    deleteSaved(authToken, item.id)
      .catch((error) => { if (!error?.notFound) throw error; })
      .then(() => {
        setItems((list) => list.filter((entry) => entry.id !== item.id));
        syncRail();
        toast.show({ message: 'Removed', actions: [{ label: 'Undo', onClick: () => restore([item]) }] });
      })
      .catch(() => failed(`Couldn't remove ${itemName(item)}`, () => remove(item)));
  };

  const clearPast = () => {
    // Only events with a known end in the past (DO3).
    const ended = past.filter((item) => isPast(item, lookups[item.id], Date.now()));
    Promise.allSettled(ended.map((item) => deleteSaved(authToken, item.id)
      .catch((error) => { if (!error?.notFound) throw error; })))
      .then((results) => {
        const gone = ended.filter((_, index) => results[index].status === 'fulfilled');
        const goneIds = new Set(gone.map((item) => item.id));
        setItems((list) => list.filter((entry) => !goneIds.has(entry.id)));
        syncRail();
        if (gone.length < ended.length) failed("Couldn't clear every past event", clearPast);
        else toast.show({ message: `Cleared ${plural(gone.length, KIND_WORDS.event)}`, actions: [{ label: 'Undo', onClick: () => restore(gone) }] });
      });
  };

  const move = (item, destination) => {
    const target = destination === UNSORTED ? null : destination;
    updateSaved(authToken, item.id, { collection_id: target })
      .then(() => {
        setItems((list) => list.map((entry) => (entry.id === item.id ? { ...entry, collection_id: target } : entry)));
        syncRail();
        const where = homes.find((home) => home.id === destination)?.name || 'Unsorted';
        toast.show({ message: `Moved to ${where}`, actions: [{ label: 'Undo', onClick: () => move(item, homeOf(item)) }] });
      })
      .catch(() => failed(`Couldn't move ${itemName(item)}`, () => move(item, destination)));
  };

  const addCollection = (name) => createCollection(authToken, { name }).then((created) => {
    setCollections((list) => [...list, { count: 0, ...created }]);
    return created;
  });

  const createFromList = (name) => {
    addCollection(name)
      .then((created) => {
        setCreating(false);
        select(created.id);
      })
      .catch(() => failed("Couldn't create the collection", () => createFromList(name)));
  };

  const createAndMove = (item, name) => {
    addCollection(name)
      .then((created) => {
        updateSaved(authToken, item.id, { collection_id: created.id })
          .then(() => {
            setItems((list) => list.map((entry) => (entry.id === item.id ? { ...entry, collection_id: created.id } : entry)));
            syncRail();
            toast.show({ message: `Moved to ${created.name}` });
          })
          .catch(() => failed(`Couldn't move ${itemName(item)}`, () => move(item, created.id)));
      })
      .catch(() => failed("Couldn't create the collection", () => createAndMove(item, name)));
  };

  const rename = (name) => {
    const id = selected;
    updateCollection(authToken, id, { name })
      .then((updated) => {
        setCollections((list) => list.map((c) => (c.id === id ? { ...c, name: updated?.name || name } : c)));
        setRenaming(false);
        renameButton.current?.focus();
      })
      .catch(() => failed("Couldn't rename the collection", () => rename(name)));
  };

  const removeCollection = () => {
    const id = selected;
    setConfirmDelete(false);
    deleteCollection(authToken, id)
      .then(() => {
        setCollections((list) => list.filter((c) => c.id !== id));
        setItems((list) => list.map((item) => (item.collection_id === id ? { ...item, collection_id: null } : item)));
        syncRail();
        setSearchParams({ collection: UNSORTED });
        toast.show({ message: `Deleted ${selectedName}. Its items are in Unsorted.` });
      })
      .catch(() => failed("Couldn't delete the collection", removeCollection));
  };

  // ---- Render ----
  const rowFor = (item, isPastRow = false) => {
    const homeId = homeOf(item);
    return (
      <SavedRow
        key={item.id}
        item={item}
        lookup={lookups[item.id]}
        past={isPastRow}
        timezone={timezone}
        onRetry={() => resolve(item)}
        onRemove={() => remove(item)}
        menu={(
          <SavedRowMenu
            name={itemName(item)}
            destinations={homes.filter((home) => home.id !== homeId)}
            onMove={(destination) => move(item, destination)}
            onCreateAndMove={(name) => createAndMove(item, name)}
            onRemove={() => remove(item)}
          />
        )}
      />
    );
  };

  // Desktop: the list beside the items. Phone: a sheet the picker opens (Q7).
  const collectionList = (
    <PhoneSheet open={pickerOpen} onClose={() => setPickerOpen(false)} labelledBy="saved-sheet-title">
      <nav className={`saved-collections ${phone ? 'is-sheet' : ''}`.trim()} aria-label="Collections">
        {phone && (
          <>
            <span className="saved-sheet-grab" aria-hidden="true" />
            <h2 id="saved-sheet-title" className="saved-sheet-title">Collection</h2>
          </>
        )}
        <ul className="saved-collection-list">
          {homes.map((home) => {
            const on = home.id === selected;
            return (
              <li key={home.id}>
                <button
                  type="button"
                  className={`saved-collection ${on ? 'is-selected' : ''}`}
                  aria-current={on ? 'true' : undefined}
                  onClick={() => select(home.id)}
                >
                  <Icon name={home.id === UNSORTED ? 'inbox' : 'folder'} size={21} filled={on} />
                  <span className="saved-collection-name">{home.name}</span>
                  <span className="saved-count" aria-label={plural(counts[home.id] || 0, ['item', 'items'])}>
                    {counts[home.id] || 0}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {phone && <hr className="saved-sheet-sep" />}
        {creating ? (
          <NameForm
            id="saved-new-collection"
            label="New collection name"
            submitLabel="Create"
            onSubmit={createFromList}
            onCancel={() => {
              setCreating(false);
              setTimeout(() => newButton.current?.focus(), 0);
            }}
          />
        ) : (
          <button ref={newButton} type="button" className="saved-new" onClick={() => setCreating(true)}>
            <Icon name="add" size={21} /> New collection
          </button>
        )}
      </nav>
    </PhoneSheet>
  );

  const picker = (
    <button
      type="button"
      className="cc-btn saved-picker"
      aria-haspopup="dialog"
      aria-expanded={pickerOpen}
      onClick={() => setPickerOpen(true)}
    >
      <Icon name="folder" size={21} />
      <span className="sr-only">Collection: </span>
      {selectedName}
      <Icon name="expand_more" size={21} />
    </button>
  );

  let body;
  if (status === 'loading' && items.length === 0) {
    body = (
      <div className="saved-panel saved-state">
        <PanelState status="loading" rows={3} label="Loading saved items…" />
      </div>
    );
  } else if (status === 'error') {
    body = (
      <div className="saved-panel saved-state">
        <PanelState status="error" message="Couldn't load saved items" onRetry={load} />
      </div>
    );
  } else if (items.length === 0 && collections.length === 0) {
    body = (
      <div className="saved-panel saved-state">
        <PanelState
          status="empty"
          icon="bookmark"
          message="Nothing saved yet. Use the bookmark on any course, event or place, here or in chat."
        />
      </div>
    );
  } else {
    body = (
      <>
        {phone && picker}
        <div className="saved-layout">
          {collectionList}
          <section className="saved-panel" aria-labelledby="saved-collection-title">
            <div className="saved-panel-head">
              {renaming && selectedCollection ? (
                <NameForm
                  id="saved-rename"
                  label={`Rename ${selectedName}`}
                  initial={selectedName}
                  submitLabel="Save"
                  onSubmit={rename}
                  onCancel={() => {
                    setRenaming(false);
                    setTimeout(() => renameButton.current?.focus(), 0);
                  }}
                />
              ) : (
                <div className="saved-title">
                  <h2 id="saved-collection-title">{selectedName}</h2>
                  <span className="saved-meta">{kindSummary(inSelected)}</span>
                </div>
              )}
              <div className="saved-panel-actions">
                {courseKeys.length > 0 && (canCompare ? (
                  <Link
                    className="cc-btn"
                    to={`/courses/compare?ids=${courseKeys.map(encodeURIComponent).join(',')}`}
                    aria-label={`Compare ${courseKeys.length} courses in ${selectedName}`}
                  >
                    <Icon name="compare_arrows" size={20} /> Compare
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="cc-btn"
                    disabled
                    title={`Compare works with ${COMPARE_MIN} to ${COMPARE_MAX} courses`}
                    aria-label={`Compare (needs ${COMPARE_MIN} to ${COMPARE_MAX} courses)`}
                  >
                    <Icon name="compare_arrows" size={20} /> Compare
                  </button>
                ))}
                {selectedCollection && !renaming && (
                  <>
                    <button
                      ref={renameButton}
                      type="button"
                      className="cc-btn cc-btn-icon"
                      aria-label={`Rename ${selectedName}`}
                      onClick={() => setRenaming(true)}
                    >
                      <Icon name="edit" size={20} />
                    </button>
                    <button
                      type="button"
                      className="cc-btn cc-btn-icon saved-danger"
                      aria-label={`Delete collection ${selectedName}`}
                      onClick={() => setConfirmDelete(true)}
                    >
                      <Icon name="delete" size={20} />
                    </button>
                  </>
                )}
              </div>
            </div>
  
            {inSelected.length === 0 ? (
              <div className="saved-empty-line">
                <PanelState
                  status="empty"
                  icon={selectedCollection ? 'folder_open' : 'inbox'}
                  message={selectedCollection ? 'Empty. Move items here from Unsorted.' : 'Nothing in Unsorted. New saves land here.'}
                />
              </div>
            ) : (
              <>
                {current.length > 0 && <ul className="saved-rows" aria-label={`Items in ${selectedName}`}>{current.map((item) => rowFor(item))}</ul>}
                {past.length > 0 && (
                  <div className="saved-past">
                    <div className="saved-past-head">
                      <button
                        type="button"
                        className="cc-btn cc-btn-ghost saved-past-toggle"
                        aria-expanded={pastOpen}
                        aria-controls="saved-past-list"
                        onClick={() => setPastOpen((open) => !open)}
                      >
                        <Icon name={pastOpen ? 'expand_more' : 'chevron_right'} size={20} />
                        Past ({past.length})
                      </button>
                      <button type="button" className="cc-btn cc-btn-ghost" onClick={clearPast}>Clear past</button>
                    </div>
                    {pastOpen && (
                      <ul id="saved-past-list" className="saved-rows" aria-label="Past events">
                        {past.map((item) => rowFor(item, true))}
                      </ul>
                    )}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </>
    );
  }

  return (
    <div className="saved-page">
      <main className="saved-main" id="main-content">
        <header className="saved-header">
          <h1>Saved</h1>
        </header>
        {body}
      </main>

      <ConfirmDialog
        isOpen={confirmDelete}
        title={`Delete ${selectedName}?`}
        message={`Its ${plural(counts[selected] || 0, ['item', 'items'])} move to Unsorted. Nothing is unsaved.`}
        confirmLabel="Delete collection"
        tone="danger"
        onConfirm={removeCollection}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
};

export default SavedPage;
