import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Icon } from '../components/icons';
import 'leaflet/dist/leaflet.css';
import PlaceSheet, { CATEGORY_ICONS } from '../components/map/PlaceSheet';
import useAsk from '../hooks/useAsk';
import useMediaMatch from '../hooks/useMediaMatch';
import { useAuth } from '../contexts/AuthContext';
import { useDockClosedByDefault } from '../contexts/ChatDockContext';
import { getPlace, listPlaces } from '../api/campus';
import { useSchool, useStartPlace, walkText } from '../modules/campus';
import '../styles/CampusHome.css';
import '../styles/CampusMapPage.css';
import { isAbort, useDelayedFlag } from '../utils/loading';

/**
 * The campus map (DESIGN.md "Map", map.html): the list column (title, the
 * start place line, search, four chips, eight places) beside a full-colour
 * map with the place card floating over it, open for the selected place. On
 * a phone the map comes first with a floating search pill and the place
 * card sits in the page under it; on a tablet the card sits under the map.
 */

/** OpenStreetMap standard tiles (tile usage policy: visible attribution). */
export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

const LIST_LIMIT = 25;
const ROWS_SHOWN = 8;
const ZOOM = 17;
const SEARCH_DEBOUNCE_MS = 300;

/** The list's four chips (map.html): All, Dining, Study, Rec. */
const CHIPS = [
  { id: '', label: 'All', icon: 'apps' },
  { id: 'dining', label: 'Dining', icon: 'restaurant' },
  { id: 'library', label: 'Study', icon: 'local_library' },
  { id: 'recreation', label: 'Rec', icon: 'fitness_center' },
];

/** A row's subtitle: the place's category. */
const CATEGORY_NAMES = {
  library: 'Library',
  dining: 'Dining',
  academic: 'Academic',
  housing: 'Housing',
  recreation: 'Recreation',
  transit: 'Bus stop',
  health: 'Health',
  arts: 'Arts',
  landmark: 'Landmark',
  other: 'Place',
};
const PLURALS = {
  dining: 'dining places', library: 'libraries', recreation: 'recreation places', health: 'health places',
};
const pluralName = (category) => PLURALS[category] || 'places';

const iconName = (category) => CATEGORY_ICONS[category] || 'location_on';

/** Where the selected pin sits in the map box: clear of the floating card on desktop (map.html). */
const DESKTOP = '(min-width: 1100px)';
const PHONE = '(max-width: 700px)';
const PIN_AT = { card: [0.36, 0.55], phone: [0.5, 0.45], centre: [0.5, 0.5] };

/** A round pin with the category's icon; the selected pin is large, in signal (DESIGN.md "Map"). */
const pinIcons = new Map();
function pinIcon(category, selected) {
  const key = `${category || 'other'}-${selected ? 'on' : 'off'}`;
  if (!pinIcons.has(key)) {
    const size = selected ? 46 : 34;
    pinIcons.set(key, L.divIcon({
      className: `map-pin map-pin--${category || 'other'} ${selected ? 'is-selected' : ''}`.trim(),
      html: `<span class="ms ms-fill">${iconName(category)}</span>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    }));
  }
  return pinIcons.get(key);
}

/** The start place: a blue dot with a white ring and a halo. */
const startIcon = L.divIcon({ className: 'map-start', html: '', iconSize: [24, 24], iconAnchor: [12, 12] });

/** Directions: OSM walking directions when a start is known, else the place. */
export function openStreetMapUrl(place, origin) {
  const fmt = (n) => Number(n).toFixed(6);
  if (origin && origin.lat != null && origin.lon != null) {
    return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=${fmt(origin.lat)},${fmt(origin.lon)};${fmt(place.lat)},${fmt(place.lon)}`;
  }
  if (place.map_url) return place.map_url;
  return `https://www.openstreetmap.org/?mlat=${fmt(place.lat)}&mlon=${fmt(place.lon)}#map=18/${fmt(place.lat)}/${fmt(place.lon)}`;
}

const hasPoint = (place) => place && place.lat != null && place.lon != null;

/**
 * Puts `focus` at `at` (fractions of the map box) at zoom 17, drops Leaflet's
 * prefix from the attribution and keeps map controls out of the tab order.
 */
function MapViewport({ focus, at }) {
  const map = useMap();
  const key = focus ? `${focus.join(',')}|${at.join(',')}` : '';
  useEffect(() => {
    map?.attributionControl?.setPrefix?.(false);
  }, [map]);
  useEffect(() => {
    if (!map || !focus) return;
    const size = map.getSize?.();
    if (size?.x && map.project && map.unproject) {
      const point = map.project(focus, ZOOM);
      map.setView(map.unproject(point.add([size.x * (0.5 - at[0]), size.y * (0.5 - at[1])]), ZOOM), ZOOM);
    } else {
      map.setView(focus, ZOOM);
    }
    // The map is aria-hidden (28A): nothing inside it may take keyboard focus.
    map.getContainer?.().querySelectorAll('a, button, [tabindex]').forEach((el) => {
      el.setAttribute('tabindex', '-1');
    });
  }, [map, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function CampusMap({
  origin, places, selected, at, onPickPlace,
}) {
  const focus = useMemo(() => {
    const first = [selected, origin, ...places].find(hasPoint);
    return first ? [first.lat, first.lon] : null;
  }, [origin, selected, places]);

  if (!focus) return <div className="map-canvas map-canvas-empty" />;

  return (
    <MapContainer
      className="map-canvas"
      center={focus}
      zoom={ZOOM}
      keyboard={false}
      zoomControl={false}
      scrollWheelZoom
      attributionControl
    >
      <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />
      <MapViewport focus={focus} at={at} />
      {places.filter(hasPoint).map((place) => (
        <Marker
          key={place.id}
          position={[place.lat, place.lon]}
          icon={pinIcon(place.category, selected?.id === place.id)}
          zIndexOffset={selected?.id === place.id ? 1000 : 0}
          keyboard={false}
          // Pins are the pointer path; the list is the keyboard path (D22).
          eventHandlers={onPickPlace ? { click: () => onPickPlace(place) } : undefined}
        />
      ))}
      {hasPoint(selected) && !places.some((p) => p.id === selected.id) && (
        <Marker position={[selected.lat, selected.lon]} icon={pinIcon(selected.category, true)} keyboard={false} />
      )}
      {hasPoint(origin) && (
        <Marker position={[origin.lat, origin.lon]} icon={startIcon} keyboard={false} interactive={false} />
      )}
    </MapContainer>
  );
}

/** "Change" popover: search places, pick one as the shared start (16A). Escape closes. */
function StartPicker({
  authToken, currentId, onPick, onClose,
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState({ status: 'idle', places: [] });
  const [saveError, setSaveError] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const text = q.trim();
    if (!text) {
      setResults({ status: 'idle', places: [] });
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setResults((prev) => ({ ...prev, status: 'loading' }));
      listPlaces(authToken, { q: text, limit: 8 }, { signal: controller.signal })
        .then((data) => setResults({ status: 'ok', places: data?.places || [] }))
        .catch((error) => { if (!isAbort(error)) setResults({ status: 'error', places: [] }); });
    }, SEARCH_DEBOUNCE_MS);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [q, authToken]);

  const pick = (place) => {
    setSaveError(null);
    onPick(place).catch(() => setSaveError(place));
  };

  return (
    <div
      className="map-picker"
      role="dialog"
      aria-label="Choose a starting place"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <label htmlFor="map-start-search" className="map-picker-label">Start from</label>
      <input
        id="map-start-search"
        ref={inputRef}
        type="search"
        value={q}
        onChange={(event) => setQ(event.target.value)}
        placeholder="Search buildings and places"
        autoComplete="off"
      />
      <div className="map-picker-results" aria-live="polite">
        {results.status === 'loading' && <p className="map-picker-note">Searching…</p>}
        {results.status === 'error' && <p className="map-picker-note is-error">Couldn't search places</p>}
        {results.status === 'ok' && results.places.length === 0 && (
          <p className="map-picker-note">No places match “{q.trim()}”</p>
        )}
        {results.places.length > 0 && (
          <ul>
            {results.places.map((place) => (
              <li key={place.id}>
                <button
                  type="button"
                  className="map-picker-option"
                  aria-current={place.id === currentId ? 'true' : undefined}
                  onClick={() => pick(place)}
                >
                  <span>{place.name}</span>
                  <span className="map-picker-cat">{CATEGORY_NAMES[place.category] || CATEGORY_NAMES.other}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {saveError && (
          <p className="map-picker-note is-error" role="alert">
            Couldn't save your starting place ·{' '}
            <button type="button" className="map-link-btn" onClick={() => pick(saveError)}>Retry</button>
          </p>
        )}
      </div>
      <button type="button" className="map-link-btn map-picker-close" onClick={onClose}>Cancel</button>
    </div>
  );
}

/** The one line kept from the route panel (design Q3): "Starting from {place} · Change". */
function StartLine({
  origin, status, onChange, buttonRef, open, picker,
}) {
  if (status === 'loading') return null;
  return (
    <div className="map-start-line">
      {origin ? (
        <p className="map-start-text">
          Starting from <strong>{origin.name}</strong>
          <span aria-hidden="true"> · </span>
          <button
            type="button"
            ref={buttonRef}
            className="map-link-btn"
            aria-label={`Change starting place (now ${origin.name})`}
            aria-expanded={open}
            onClick={onChange}
          >
            Change
          </button>
        </p>
      ) : (
        <button type="button" ref={buttonRef} className="map-link-btn" aria-expanded={open} onClick={onChange}>
          Choose a starting point
        </button>
      )}
      {open && picker}
    </div>
  );
}

const CampusMapPage = () => {
  useDockClosedByDefault('map');
  const [searchParams] = useSearchParams();
  const { authToken } = useAuth();
  const { timezone } = useSchool();
  const start = useStartPlace();
  const desktop = useMediaMatch(DESKTOP);
  const phone = useMediaMatch(PHONE);

  // URL context from chat cards (14A), read once. The map draws its own
  // place card, so the shell's ?place= selects the place here like ?to=.
  const initial = useRef({
    from: searchParams.get('from') || '',
    to: searchParams.get('to') || searchParams.get('place') || '',
    category: searchParams.get('category') || '',
  }).current;

  // ?from= sets the start for this view only; otherwise the shared start place.
  const [override, setOverride] = useState({ status: 'loading', place: null });
  const [category, setCategory] = useState(initial.category);
  const [list, setList] = useState({ status: 'loading', places: [] });
  const [reloadKey, setReloadKey] = useState(0);
  const [selected, setSelected] = useState(null);
  // The card is open for the selection from the start (map.html); closing hides it.
  const [cardOpen, setCardOpen] = useState(true);
  const [focusCard, setFocusCard] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const pendingTo = useRef(initial.to);
  const startButtonRef = useRef(null);

  // ---- Start place: ?from= for this view, else the shared saved start (16A).
  useEffect(() => {
    if (!authToken || !initial.from) return undefined;
    const controller = new AbortController();
    getPlace(authToken, initial.from, { signal: controller.signal })
      .then((data) => setOverride({ status: 'ok', place: data?.place || null }))
      .catch((error) => {
        if (isAbort(error)) return;
        setOverride({ status: 'error', place: null });
      });
    return () => controller.abort();
  }, [authToken, initial.from]);

  const sharedStatus = start.status === 'ready' ? 'ok' : start.status;
  const origin = initial.from ? override.place : start.place;
  const originStatus = initial.from ? override.status : sharedStatus;
  const originId = origin?.id || '';
  const originResolved = originStatus !== 'loading';

  // ---- Places, nearest first (category, search, origin, retry).
  useEffect(() => {
    if (!authToken || !originResolved) return undefined;
    const controller = new AbortController();
    const opts = { signal: controller.signal };
    setList((prev) => ({ ...prev, status: 'loading' }));

    const run = async () => {
      const params = { category, from: originId, limit: LIST_LIMIT };
      if (query) params.q = query;
      const data = await listPlaces(authToken, params, opts);
      const places = data?.places || [];
      setList({ status: 'ok', places });

      const to = pendingTo.current;
      pendingTo.current = '';
      if (to) {
        const row = places.find((p) => p.id === to);
        if (row) {
          setSelected(row);
        } else {
          try {
            const one = await getPlace(authToken, to, { ...opts });
            if (one?.place) setSelected(one.place);
          } catch (error) {
            if (isAbort(error)) throw error;
          }
        }
        return;
      }
      setSelected((prev) => {
        // A search shows its first match; otherwise the nearest place until one is picked.
        if (query && places.length && !places.some((p) => p.id === prev?.id)) return places[0];
        if (!prev) return places[0] || null;
        return places.find((p) => p.id === prev.id) || prev;
      });
    };

    run().catch((error) => {
      if (isAbort(error)) return;
      setList((prev) => ({ ...prev, status: 'error' }));
    });
    return () => controller.abort();
  }, [authToken, originResolved, originId, category, query, reloadKey]);

  // ---- Search box: the list follows the typed name after a pause.
  useEffect(() => {
    const text = draft.trim();
    if (text === query) return undefined;
    const timer = setTimeout(() => setQuery(text), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, query]);

  const selectedId = selected?.id || '';
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  const chooseCategory = (next) => {
    if (next === category) return;
    setList((prev) => ({ ...prev, places: [] }));
    setCategory(next);
  };

  const closePicker = useCallback(() => {
    setPickerOpen(false);
    setTimeout(() => startButtonRef.current?.focus(), 0);
  }, []);

  const pickStart = async (place) => {
    const stored = await start.save(place);
    if (initial.from) setOverride({ status: 'ok', place: stored });
    closePicker();
  };

  const ask = useAsk();
  const openCard = useCallback((place) => {
    setSelected(place);
    setCardOpen(true);
    setFocusCard(true);
  }, []);
  const closeCard = useCallback(() => {
    setCardOpen(false);
    setFocusCard(false);
    const id = selectedIdRef.current;
    setTimeout(() => {
      [...document.querySelectorAll('[data-place-row]')].find((row) => row.dataset.placeRow === id)?.focus();
    }, 0);
  }, []);
  const directions = useCallback((place) => {
    window.open(openStreetMapUrl(place, origin), '_blank', 'noopener,noreferrer');
  }, [origin]);

  const places = list.places;
  const rows = places.slice(0, ROWS_SHOWN);
  const listSlow = useDelayedFlag(list.status === 'loading' && list.places.length === 0);
  const showCard = cardOpen && Boolean(selected);
  let at = PIN_AT.centre;
  if (phone) at = PIN_AT.phone;
  else if (desktop && showCard) at = PIN_AT.card;

  const chipName = CHIPS.find((chip) => chip.id === category)?.label || 'All';

  return (
    <div className="campus-home map-page">
      <main className="campus-main map-main" id="main-content">
        <div className="map-layout">
          <div className="map-side">
            <header className="map-header">
              <h1>Campus map</h1>
              <StartLine
                origin={origin}
                status={originStatus}
                onChange={() => setPickerOpen((open) => !open)}
                buttonRef={startButtonRef}
                open={pickerOpen}
                picker={(
                  <StartPicker
                    authToken={authToken}
                    currentId={originId}
                    onPick={pickStart}
                    onClose={closePicker}
                  />
                )}
              />
            </header>

            <form className="map-search" role="search" onSubmit={(event) => { event.preventDefault(); setQuery(draft.trim()); }}>
              <Icon name="search" size={20} />
              <label htmlFor="map-search-input" className="sr-only">Search places</label>
              <input
                id="map-search-input"
                type="search"
                value={draft}
                placeholder="Search places"
                autoComplete="off"
                onChange={(event) => setDraft(event.target.value)}
              />
            </form>

            <div className="map-filters" role="group" aria-label="Place categories">
              {CHIPS.map((chip) => (
                <button
                  type="button"
                  key={chip.id || 'all'}
                  className={`map-chip ${chip.id === category ? 'is-on' : ''}`.trim()}
                  aria-pressed={chip.id === category}
                  onClick={() => chooseCategory(chip.id)}
                >
                  <Icon name={chip.icon} size={18} filled={chip.id === category} />
                  {chip.label}
                </button>
              ))}
            </div>

            <section className="map-list" aria-label={`${chipName}, nearest first`}>
              {list.status === 'error' && (
                <div className="map-state" role="alert">
                  <p>Couldn't load places</p>
                  <button type="button" className="map-btn" onClick={() => setReloadKey((k) => k + 1)}>Retry</button>
                </div>
              )}

              {list.status === 'loading' && list.places.length === 0 && listSlow && (
                <ul className="map-rows" aria-hidden="true">
                  {[0, 1, 2].map((i) => (
                    <li className="map-row is-placeholder" key={i}>
                      <span className="map-row-main"><span className="map-row-name">–</span></span>
                    </li>
                  ))}
                </ul>
              )}

              {list.status === 'ok' && places.length === 0 && (
                <div className="map-state">
                  <p>{query ? `No places match “${query}”` : `No ${pluralName(category)} on the campus map`}</p>
                  {category && (
                    <button type="button" className="map-btn" onClick={() => chooseCategory('')}>Show all</button>
                  )}
                </div>
              )}

              {list.status !== 'error' && rows.length > 0 && (
                <ul className="map-rows">
                  {rows.map((place) => {
                    const isSelected = place.id === selectedId;
                    const walk = walkText(place.walk_minutes);
                    return (
                      <li className={`map-row ${isSelected ? 'is-selected' : ''}`.trim()} key={place.id}>
                        <button
                          type="button"
                          className="map-row-main"
                          aria-pressed={isSelected}
                          data-place-row={place.id}
                          onClick={() => openCard(place)}
                        >
                          <span className="map-row-icon" aria-hidden="true">
                            <Icon name={iconName(place.category)} size={20} />
                          </span>
                          <span className="map-row-text">
                            <span className="map-row-name">{place.name}</span>
                            <span className="map-row-kind">{CATEGORY_NAMES[place.category] || CATEGORY_NAMES.other}</span>
                          </span>
                          {walk && <span className="map-row-walk">{walk}</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          <div className="map-stage">
            {/* The list is the accessible equivalent of the map (28A). */}
            <div className="map-frame" aria-hidden="true">
              {originResolved && !(list.status === 'loading' && listSlow) ? (
                <CampusMap
                  origin={origin}
                  places={places}
                  selected={selected}
                  at={at}
                  onPickPlace={openCard}
                />
              ) : (
                <div className="map-canvas map-canvas-empty" />
              )}
            </div>
          </div>

          {showCard && (
            <div className="map-card">
              <PlaceSheet
                key={selected.id}
                placeId={selected.id}
                place={selected}
                from={originId || undefined}
                timezone={timezone}
                onClose={closeCard}
                onAsk={ask}
                onDirections={directions}
                titleId="map-place-title"
                autoFocus={focusCard}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default CampusMapPage;
