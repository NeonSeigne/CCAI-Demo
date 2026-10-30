import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, ChevronDown, ChevronRight, Plus, RefreshCw } from '../components/icons';
import ConfirmDialog from '../components/ConfirmDialog';
import SavedRowMenu from '../components/saved/SavedRowMenu';
import { useToast } from '../components/Toast';
import { formatEventRange } from '../components/visuals/EventListCard';
import { useAppConfig } from '../contexts/AppConfigContext';
import { useAuth } from '../contexts/AuthContext';
import { useSaved } from '../contexts/SavedContext';
import {
  createCollection,
  createSaved,
  deleteCollection,
  deleteSaved,
  getCampusOrigin,
  getCatalogCourse,
  getEvent,
  getPlace,
  listCollections,
  listSaved,
  updateCollection,
  updateSaved,
} from '../api/campus';
import { downloadEventIcs } from '../utils/ics';
import '../styles/SavedPage.css';

export const UNSORTED = 'unsorted';
/** Each live lookup gets 5 s (R8). */
export const LOOKUP_TIMEOUT_MS = 5000;
const COMPARE_MIN = 2;
const COMPARE_MAX = 4;

const LOOKUPS = { course: getCatalogCourse, event: getEvent, place: getPlace };
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

const dayLabel = (iso, timezone) => {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric', ...(timezone ? { timeZone: timezone } : {}),
    });
  } catch {
    return new Date(iso).toLocaleDateString();
  }
};

function Walk({ minutes }) {
  if (minutes == null) return <span className="saved-walk is-unavailable">Walk time unavailable</span>;
  return <span className="saved-walk">{minutes === 0 ? 'Your starting place' : `${minutes} min walk`}</span>;
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
const clockTime = (value, timezone) => {
  const parsed = time(value);
  if (parsed === null) return value;
  try {
    return new Date(parsed).toLocaleTimeString([], {
      hour: 'numeric', minute: '2-digit', ...(timezone ? { timeZone: timezone } : {}),
    });
  } catch {
    return new Date(parsed).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
};

const hoursText = (place, timezone) => {
  if (place.open_now && place.open_until) return `Open until ${clockTime(place.open_until, timezone)}`;
  if (place.open_now === true) return 'Open now';
  const listed = typeof place.hours === 'string' && place.hours ? place.hours : null;
  if (place.open_now === false) return listed ? `Closed · ${listed}` : 'Closed now';
  return listed || 'Hours not listed';
};

// ---- Rows -------------------------------------------------------------------

function RowPlaceholder({ item }) {
  return (
    <div className="saved-row-body" aria-busy="true">
      <span className="sr-only">Checking {itemName(item)}…</span>
      <span className="saved-ph" aria-hidden="true">
        <span className="saved-ph-bar is-short" />
        <span className="saved-ph-bar" />
      </span>
    </div>
  );
}

function CourseRow({ course }) {
  const code = course.identifier;
  const grade = gradeLine(course.grades);
  const seats = course.sections?.seats_open;
  return (
    <>
      <div className="saved-row-body saved-row-course">
        <span className="saved-code">{code}</span>
        <span className="saved-text">
          <strong>{course.title}</strong>
          {grade && <span className="saved-meta">{grade}</span>}
        </span>
      </div>
      {seats != null && (
        <span className="saved-tag">
          {seats} {course.sections.term ? `${course.sections.term} ` : ''}{seats === 1 ? 'seat' : 'seats'}
        </span>
      )}
      <Link className="saved-btn" to={`/courses?selected=${encodeURIComponent(code)}`} aria-label={`Course page for ${code}`}>
        Course page
      </Link>
    </>
  );
}

function EventRow({ event, timezone }) {
  return (
    <>
      <div className="saved-row-body">
        <span className="saved-when">
          {event.start ? `${dayLabel(event.start, timezone)} · ${formatEventRange(event, timezone)}` : 'Date not listed'}
        </span>
        <span className="saved-text">
          <strong>{event.title}</strong>
          <span className="saved-meta">
            {event.location && <span>{event.location}</span>}
            {/* Only a venue on the campus map has a walk; off-campus and online ones show none. */}
            {event.place_id && <Walk minutes={event.walk_minutes} />}
          </span>
        </span>
      </div>
      <button
        type="button"
        className="saved-btn"
        aria-label={`Add ${event.title} to calendar`}
        onClick={() => downloadEventIcs(event)}
      >
        Add to calendar
      </button>
    </>
  );
}

function PlaceRow({ place, timezone }) {
  return (
    <>
      <div className="saved-row-body">
        <span className="saved-text">
          <strong>{place.name}</strong>
          <span className="saved-meta">
            <span>{hoursText(place, timezone)}</span>
            <Walk minutes={place.walk_minutes} />
          </span>
        </span>
      </div>
      <Link className="saved-btn" to={`/map?to=${encodeURIComponent(place.id)}`} aria-label={`Directions to ${place.name}`}>
        Directions
      </Link>
    </>
  );
}

function FallbackRow({ item, label, children }) {
  return (
    <>
      <div className="saved-row-body">
        <span className="saved-text">
          <strong>{itemName(item)}</strong>
          <span className="saved-meta saved-status">{label}</span>
        </span>
      </div>
      {children}
    </>
  );
}

function SavedRow({ item, lookup, past, timezone, menu, onRetry, onRemove }) {
  const name = itemName(item);
  let content;
  if (past) {
    content = (
      <FallbackRow item={item} label={item.event_start ? `Ended · ${dayLabel(item.event_start, timezone)}` : 'Ended'} />
    );
  } else if (!lookup || lookup.state === 'loading') {
    content = <RowPlaceholder item={item} />;
  } else if (lookup.state === 'gone') {
    content = (
      <FallbackRow item={item} label="No longer listed">
        <button type="button" className="saved-btn" aria-label={`Remove ${name}`} onClick={onRemove}>Remove</button>
      </FallbackRow>
    );
  } else if (lookup.state === 'unavailable') {
    content = (
      <FallbackRow item={item} label="Couldn't check right now">
        <button type="button" className="saved-btn" aria-label={`Retry checking ${name}`} onClick={onRetry}>
          <RefreshCw size={15} aria-hidden="true" /> Retry
        </button>
      </FallbackRow>
    );
  } else if (item.kind === 'course') {
    content = <CourseRow course={{ identifier: item.key, ...lookup.data }} />;
  } else if (item.kind === 'event') {
    content = <EventRow event={{ id: item.key, title: name, ...lookup.data }} timezone={timezone} />;
  } else if (item.kind === 'place') {
    content = <PlaceRow place={{ id: item.key, name, ...lookup.data }} timezone={timezone} />;
  } else {
    content = <FallbackRow item={item} label="Saved item" />;
  }
  return (
    <li className={`saved-row is-${item.kind}`} data-testid={`saved-row-${item.key}`}>
      {content}
      {menu}
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
      <button type="submit" className="saved-btn is-primary" disabled={!value.trim()}>{submitLabel}</button>
      <button type="button" className="saved-btn" onClick={onCancel}>Cancel</button>
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
  const { config } = useAppConfig();
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
  const newButton = useRef(null);
  const renameButton = useRef(null);
  const controllers = useRef(new Map());
  const started = useRef(new Set());
  const originId = useRef(null);
  const loadRun = useRef(0);

  const timezone = config?.school?.timezone;
  const syncRail = () => savedContext?.reload?.();

  // ---- Load ----
  const load = useCallback(() => {
    const run = loadRun.current + 1;
    loadRun.current = run;
    setStatus('loading');
    Promise.all([
      listSaved(authToken),
      listCollections(authToken),
      // Walk times are measured from the student's starting place; without it rows just say unavailable.
      getCampusOrigin(authToken).catch(() => null),
    ])
      .then(([list, cols, origin]) => {
        if (loadRun.current !== run) return;
        originId.current = origin?.place?.id || null;
        setItems(Array.isArray(list) ? list : []);
        setCollections(Array.isArray(cols) ? cols : cols?.collections || []);
        setStatus('ready');
      })
      .catch(() => {
        if (loadRun.current === run) setStatus('error');
      });
  }, [authToken]);

  useEffect(() => {
    if (authToken) load();
  }, [authToken, load]);

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

  const collectionList = (
    <nav className="saved-collections" aria-label="Collections">
      <ul>
        {homes.map((home) => (
          <li key={home.id}>
            <button
              type="button"
              className={`saved-collection ${home.id === selected ? 'is-selected' : ''}`}
              aria-current={home.id === selected ? 'true' : undefined}
              onClick={() => select(home.id)}
            >
              <span className="saved-collection-name">{home.name}</span>
              <span className="saved-count" aria-label={plural(counts[home.id] || 0, ['item', 'items'])}>
                {counts[home.id] || 0}
              </span>
            </button>
          </li>
        ))}
      </ul>
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
          <Plus size={16} aria-hidden="true" /> New collection
        </button>
      )}
    </nav>
  );

  const picker = (
    <div className="saved-picker">
      <label htmlFor="saved-collection-picker">Collection</label>
      <select id="saved-collection-picker" value={selected} onChange={(event) => select(event.target.value)}>
        {homes.map((home) => (
          <option key={home.id} value={home.id}>{home.name} ({counts[home.id] || 0})</option>
        ))}
      </select>
    </div>
  );

  let body;
  if (status === 'loading' && items.length === 0) {
    body = (
      <div className="saved-panel" aria-busy="true">
        <p className="sr-only">Loading saved items…</p>
        <span className="saved-ph is-panel" aria-hidden="true">
          <span className="saved-ph-bar is-short" />
          <span className="saved-ph-bar" />
          <span className="saved-ph-bar" />
        </span>
      </div>
    );
  } else if (status === 'error') {
    body = (
      <div className="saved-panel saved-error" role="alert">
        <p>Couldn&apos;t load saved items</p>
        <button type="button" className="saved-btn" onClick={load}>
          <RefreshCw size={15} aria-hidden="true" /> Retry
        </button>
      </div>
    );
  } else if (items.length === 0 && collections.length === 0) {
    body = (
      <div className="saved-panel saved-empty">
        <p>Nothing saved yet. Use the bookmark on any course, event or place, here or in chat.</p>
      </div>
    );
  } else {
    body = (
      <div className="saved-layout">
        {collectionList}
        <section className="saved-panel" aria-labelledby="saved-collection-title">
          {picker}
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
                  className="saved-btn"
                  to={`/courses/compare?ids=${courseKeys.map(encodeURIComponent).join(',')}`}
                  aria-label={`Compare ${courseKeys.length} courses in ${selectedName}`}
                >
                  <ArrowLeftRight size={15} aria-hidden="true" /> Compare
                </Link>
              ) : (
                <button
                  type="button"
                  className="saved-btn"
                  disabled
                  title={`Compare works with ${COMPARE_MIN} to ${COMPARE_MAX} courses`}
                  aria-label={`Compare (needs ${COMPARE_MIN} to ${COMPARE_MAX} courses)`}
                >
                  <ArrowLeftRight size={15} aria-hidden="true" /> Compare
                </button>
              ))}
              {selectedCollection && !renaming && (
                <>
                  <button
                    ref={renameButton}
                    type="button"
                    className="saved-btn"
                    aria-label={`Rename ${selectedName}`}
                    onClick={() => setRenaming(true)}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="saved-btn is-danger"
                    aria-label={`Delete collection ${selectedName}`}
                    onClick={() => setConfirmDelete(true)}
                  >
                    Delete collection
                  </button>
                </>
              )}
            </div>
          </div>

          {inSelected.length === 0 ? (
            <p className="saved-empty-line">
              {selectedCollection ? 'Empty. Move items here from Unsorted.' : 'Nothing in Unsorted. New saves land here.'}
            </p>
          ) : (
            <>
              {current.length > 0 && <ul className="saved-rows" aria-label={`Items in ${selectedName}`}>{current.map((item) => rowFor(item))}</ul>}
              {past.length > 0 && (
                <div className="saved-past">
                  <div className="saved-past-head">
                    <button
                      type="button"
                      className="saved-past-toggle"
                      aria-expanded={pastOpen}
                      aria-controls="saved-past-list"
                      onClick={() => setPastOpen((open) => !open)}
                    >
                      {pastOpen ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
                      Past ({past.length})
                    </button>
                    <button type="button" className="saved-btn" onClick={clearPast}>Clear past</button>
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
