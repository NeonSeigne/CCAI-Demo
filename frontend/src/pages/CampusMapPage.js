import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MapContainer, TileLayer, CircleMarker, Polyline, useMap } from 'react-leaflet';
import { ExternalLink, MessageCircle } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import CampusRail from '../components/CampusRail';
import SaveButton from '../components/SaveButton';
import SettingsModal from '../components/SettingsModal';
import { useAppConfig } from '../contexts/AppConfigContext';
import { useAuth } from '../contexts/AuthContext';
import {
  getCampusOrigin, getPlace, getRoute, listPlaces, setCampusOrigin,
} from '../api/campus';
import '../styles/CampusHome.css';
import '../styles/CampusMapPage.css';

/** OpenStreetMap standard tiles (tile usage policy: visible attribution). */
export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

const LIST_LIMIT = 25;
const NEAREST_SHOWN = 3;
const PLACEHOLDER_DELAY_MS = 300;
const SEARCH_DEBOUNCE_MS = 300;

/** Backend category ids → [chip label, lower-case plural for sentences]. */
const CATEGORY_NAMES = {
  library: ['Libraries', 'libraries'],
  dining: ['Dining', 'dining places'],
  academic: ['Academic buildings', 'academic buildings'],
  housing: ['Housing', 'housing'],
  recreation: ['Recreation', 'recreation places'],
  transit: ['Bus stops', 'bus stops'],
  health: ['Health', 'health places'],
  arts: ['Arts', 'arts places'],
  landmark: ['Landmarks', 'landmarks'],
  other: ['Other places', 'other places'],
};
const CATEGORY_ORDER = Object.keys(CATEGORY_NAMES);
const chipLabel = (category) => (category ? CATEGORY_NAMES[category]?.[0] || category : 'All places');
const pluralName = (category) => (category ? CATEGORY_NAMES[category]?.[1] || category : 'places');

/** True after `active` has held for `ms` (placeholders after 300 ms, 9A). */
function useDelayedFlag(active, ms = PLACEHOLDER_DELAY_MS) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) {
      setShown(false);
      return undefined;
    }
    const timer = setTimeout(() => setShown(true), ms);
    return () => clearTimeout(timer);
  }, [active, ms]);
  return shown;
}

const isAbort = (error) => error?.name === 'AbortError';

export function formatDistance(metres) {
  if (typeof metres !== 'number' || Number.isNaN(metres)) return '';
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

export function hoursLine(place, timezone) {
  if (place?.open_now === true) {
    if (!place.open_until) return 'Open now';
    const until = new Date(place.open_until);
    if (Number.isNaN(until.getTime())) return 'Open now';
    let time;
    try {
      time = until.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: timezone || undefined });
    } catch {
      time = until.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    return `Open until ${time}`;
  }
  if (place?.open_now === false) return 'Closed now';
  return 'Hours not listed';
}

/** The panel's way out (31A): OSM walking directions when a start is known, else the place. */
export function openStreetMapUrl(place, origin) {
  const fmt = (n) => Number(n).toFixed(6);
  if (origin && origin.lat != null && origin.lon != null) {
    return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=${fmt(origin.lat)},${fmt(origin.lon)};${fmt(place.lat)},${fmt(place.lon)}`;
  }
  if (place.map_url) return place.map_url;
  return `https://www.openstreetmap.org/?mlat=${fmt(place.lat)}&mlon=${fmt(place.lon)}#map=18/${fmt(place.lat)}/${fmt(place.lon)}`;
}

const hasPoint = (place) => place && place.lat != null && place.lon != null;

/** Fits the view to the start, the selection and the route; keeps map controls out of the tab order. */
function MapViewport({ points }) {
  const map = useMap();
  const key = points.map((p) => p.join(',')).join(';');
  useEffect(() => {
    if (!map || !points.length) return;
    if (points.length === 1) {
      map.setView(points[0], 17);
    } else {
      map.fitBounds(points, { padding: [40, 40], maxZoom: 17 });
    }
    // The map is aria-hidden (28A): nothing inside it may take keyboard focus.
    map.getContainer?.().querySelectorAll('a, button, [tabindex]').forEach((el) => {
      el.setAttribute('tabindex', '-1');
    });
  }, [map, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function CampusMap({ origin, places, selected, route }) {
  const center = useMemo(() => {
    const first = [origin, selected, ...places].find(hasPoint);
    return first ? [first.lat, first.lon] : null;
  }, [origin, selected, places]);

  const line = useMemo(
    () => (route?.geometry?.coordinates || []).map(([lon, lat]) => [lat, lon]),
    [route],
  );
  const fitPoints = useMemo(() => {
    const pts = [];
    if (hasPoint(origin)) pts.push([origin.lat, origin.lon]);
    if (hasPoint(selected)) pts.push([selected.lat, selected.lon]);
    if (line.length) pts.push(...line);
    if (!pts.length && center) pts.push(center);
    return pts;
  }, [origin, selected, line, center]);

  if (!center) return <div className="map-canvas map-canvas-empty" />;

  return (
    <MapContainer
      className="map-canvas"
      center={center}
      zoom={16}
      keyboard={false}
      scrollWheelZoom
      attributionControl
    >
      <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />
      <MapViewport points={fitPoints} />
      {places.filter(hasPoint).map((place) => (
        <CircleMarker
          // Leaflet sets className only on creation: remount when selection changes.
          key={`${place.id}-${selected?.id === place.id ? 'on' : 'off'}`}
          center={[place.lat, place.lon]}
          radius={selected?.id === place.id ? 9 : 6}
          className={`map-pin ${selected?.id === place.id ? 'is-selected' : ''}`.trim()}
        />
      ))}
      {hasPoint(selected) && !places.some((p) => p.id === selected.id) && (
        <CircleMarker center={[selected.lat, selected.lon]} radius={9} className="map-pin is-selected" />
      )}
      {line.length > 1 && (
        <Polyline
          key={`${route.from}-${route.to}`}
          positions={line}
          className="map-route-line"
          eventHandlers={{
            // pathLength 1 lets CSS draw the line start → place (22A).
            add: (event) => event.target.getElement?.()?.setAttribute('pathLength', '1'),
          }}
        />
      )}
      {hasPoint(origin) && (
        <CircleMarker center={[origin.lat, origin.lon]} radius={7} className="map-start" />
      )}
    </MapContainer>
  );
}

/** "Change" popover: search places, pick one as the shared start (16A). Escape closes. */
function StartPicker({ authToken, currentId, onPick, onClose }) {
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
                  <span className="map-picker-cat">{chipLabel(place.category)}</span>
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

function RoutePanel({ origin, originStatus, selected, route, onChangeStart, startButtonRef, pickerOpen, picker }) {
  const routeSlow = useDelayedFlag(route.status === 'loading');
  return (
    <section className="map-panel" aria-label="Walking route">
      <div className="map-start-block">
        {origin ? (
          <>
            <span className="map-panel-kicker">Starting from</span>
            <div className="map-start-row">
              <strong className="map-start-name">{origin.name}</strong>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                ref={startButtonRef}
                className="map-link-btn"
                aria-label={`Change starting place (now ${origin.name})`}
                aria-expanded={pickerOpen}
                onClick={onChangeStart}
              >
                Change
              </button>
            </div>
          </>
        ) : (
          originStatus !== 'loading' && (
            <button
              type="button"
              ref={startButtonRef}
              className="map-choose-start"
              aria-expanded={pickerOpen}
              onClick={onChangeStart}
            >
              Choose a starting point
            </button>
          )
        )}
        {pickerOpen && picker}
      </div>

      {selected && (
        <div className="map-dest" aria-live="polite">
          {selected.label && <span className="map-panel-kicker">{selected.label}</span>}
          <span className="map-dest-name">{origin ? `Walking to ${selected.place.name}` : selected.place.name}</span>
          {origin && route.status === 'ok' && (
            <>
              <span className="map-dest-minutes">{route.data.minutes} min</span>
              <span className="map-dest-metres">{formatDistance(route.data.distance_m)} along paths</span>
            </>
          )}
          {origin && route.status === 'loading' && routeSlow && (
            <span className="map-dest-placeholder" aria-label="Finding the walking route" />
          )}
          {origin && route.status === 'error' && (
            <span className="map-dest-unavailable">Walking route unavailable</span>
          )}
          {!origin && <span className="map-dest-metres">Choose a starting point to see the walk.</span>}
          <a
            className="map-osm-link"
            href={openStreetMapUrl(selected.place, origin)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open in OpenStreetMap
            <ExternalLink size={14} aria-hidden="true" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      )}
    </section>
  );
}

const CampusMapPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, authToken, handleSignOut, handleUserUpdate } = useAuth();
  const { config, advisors } = useAppConfig();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const school = config?.app?.institution || config?.app?.title || 'Your campus';
  const timezone = config?.school?.timezone;

  // URL context from chat cards (14A), read once.
  const initial = useRef({
    from: searchParams.get('from') || '',
    to: searchParams.get('to') || '',
    category: searchParams.get('category'),
  }).current;

  const [origin, setOrigin] = useState(null);
  const [originStatus, setOriginStatus] = useState('loading');
  const [category, setCategory] = useState(initial.category ?? null);
  const [list, setList] = useState({ status: 'loading', places: [], categories: {}, suggested: null });
  const [reloadKey, setReloadKey] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState(null); // {place, label}
  const [route, setRoute] = useState({ status: 'idle', data: null });
  const [pickerOpen, setPickerOpen] = useState(false);
  const pendingSelect = useRef({ to: initial.to, suggest: true });
  const startButtonRef = useRef(null);

  // ---- Start place: ?from= for this view, else the shared saved start (16A).
  useEffect(() => {
    if (!authToken) return undefined;
    const controller = new AbortController();
    const load = initial.from
      ? getPlace(authToken, initial.from, { signal: controller.signal }).then((data) => data?.place || null)
      : getCampusOrigin(authToken, { signal: controller.signal }).then((data) => data?.place || null);
    load
      .then((place) => { setOrigin(place); setOriginStatus('ok'); })
      .catch((error) => {
        if (isAbort(error)) return;
        setOrigin(null);
        setOriginStatus('error');
      });
    return () => controller.abort();
  }, [authToken, initial.from]);

  const originId = origin?.id || '';
  const originResolved = originStatus !== 'loading';

  // ---- Places list (category, origin, retry).
  useEffect(() => {
    if (!authToken || !originResolved) return undefined;
    const controller = new AbortController();
    const opts = { signal: controller.signal };
    setList((prev) => ({ ...prev, status: 'loading' }));

    const run = async () => {
      if (category === null) {
        // No ?category=: ask for the school's default first (R15).
        const probe = await listPlaces(authToken, { from: originId, limit: 1 }, opts);
        setCategory(probe?.default_category || '');
        return;
      }
      const data = await listPlaces(authToken, { category, from: originId, limit: LIST_LIMIT }, opts);
      const places = data?.places || [];
      setList({
        status: 'ok',
        places,
        categories: data?.categories || {},
        suggested: data?.suggested || null,
      });

      const pending = pendingSelect.current;
      pendingSelect.current = { to: '', suggest: false };
      if (pending.to) {
        const row = places.find((p) => p.id === pending.to);
        if (row) {
          setSelected({ place: row, label: null });
        } else {
          try {
            const one = await getPlace(authToken, pending.to, { ...opts });
            if (one?.place) setSelected({ place: one.place, label: null });
          } catch (error) {
            if (isAbort(error)) throw error;
          }
        }
      } else if (pending.suggest && data?.suggested) {
        const row = places.find((p) => p.id === data.suggested.id);
        if (row) setSelected({ place: row, label: data.suggested.label });
      } else {
        // Same selection, fresh row (walk times from a new start).
        setSelected((prev) => {
          if (!prev) return prev;
          const row = places.find((p) => p.id === prev.place.id);
          return row ? { ...prev, place: row } : prev;
        });
      }
    };

    run().catch((error) => {
      if (isAbort(error)) return;
      setList((prev) => ({ ...prev, status: 'error' }));
    });
    return () => controller.abort();
  }, [authToken, originResolved, originId, category, reloadKey]);

  // ---- Walking route for the selection (R4: failure → no line, no time).
  const selectedId = selected?.place?.id || '';
  useEffect(() => {
    if (!authToken || !originId || !selectedId) {
      setRoute({ status: 'idle', data: null });
      return undefined;
    }
    if (originId === selectedId) {
      setRoute({ status: 'ok', data: { minutes: 0, distance_m: 0, geometry: null, from: originId, to: selectedId } });
      return undefined;
    }
    const controller = new AbortController();
    setRoute({ status: 'loading', data: null });
    getRoute(authToken, { from: originId, to: selectedId }, { signal: controller.signal })
      .then((data) => setRoute({ status: 'ok', data: { ...data, from: originId, to: selectedId } }))
      .catch((error) => {
        if (isAbort(error)) return;
        setRoute({ status: 'error', data: null });
      });
    return () => controller.abort();
  }, [authToken, originId, selectedId]);

  const chooseCategory = (next) => {
    if (next === category) return;
    pendingSelect.current = { to: '', suggest: true };
    setExpanded(false);
    setList((prev) => ({ ...prev, places: [], suggested: null }));
    setCategory(next);
  };

  const closePicker = useCallback(() => {
    setPickerOpen(false);
    setTimeout(() => startButtonRef.current?.focus(), 0);
  }, []);

  const pickStart = async (place) => {
    const data = await setCampusOrigin(authToken, place.id);
    setOrigin(data?.place || place);
    setOriginStatus('ok');
    closePicker();
  };

  const ask = () => {
    if (!selected) {
      navigate('/chat', { state: { startNew: true } });
      return;
    }
    const pendingPrompt = origin
      ? `How do I get from ${origin.name} to ${selected.place.name}?`
      : `How do I get to ${selected.place.name}?`;
    navigate('/chat', { state: { startNew: true, pendingPrompt } });
  };

  const handleSignOutClick = () => {
    handleSignOut();
    navigate('/', { replace: true });
  };

  // ---- List rows: 3 nearest, the selection kept visible, "See N more".
  const places = list.places;
  const selectedIndex = places.findIndex((p) => p.id === selectedId);
  const visible = expanded ? places : places.filter((p, i) => i < NEAREST_SHOWN || i === selectedIndex);
  const moreCount = places.length - visible.length;

  const chips = useMemo(() => {
    const counts = list.categories || {};
    const ids = CATEGORY_ORDER.filter((id) => counts[id] > 0 || id === category);
    Object.keys(counts).forEach((id) => { if (!ids.includes(id) && counts[id] > 0) ids.push(id); });
    const total = Object.values(counts).reduce((sum, n) => sum + (n || 0), 0);
    return [{ id: '', count: total }, ...ids.map((id) => ({ id, count: counts[id] || 0 }))];
  }, [list.categories, category]);

  const listSlow = useDelayedFlag(list.status === 'loading' && list.places.length === 0);
  const originSlow = useDelayedFlag(originStatus === 'loading');
  const routeAttribution = route.status === 'ok' ? route.data?.attribution : null;

  const picker = (
    <StartPicker
      authToken={authToken}
      currentId={originId}
      onPick={pickStart}
      onClose={closePicker}
    />
  );

  return (
    <div className="campus-home map-page">
      <CampusRail
        onNewChat={() => navigate('/chat', { state: { startNew: true } })}
        onSelectSession={(sessionId) => navigate('/chat', { state: { sessionId } })}
        onShowAllChats={() => navigate('/search')}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onSignOut={handleSignOutClick}
      />

      <main className="campus-main map-main" id="main-content">
        <div className="map-column">
          <header className="map-header">
            <div>
              <p className="campus-kicker">{school}</p>
              <h1>Campus map</h1>
            </div>
            <button type="button" className="map-ask" onClick={ask}>
              <MessageCircle size={16} aria-hidden="true" />
              {selected ? 'Ask about this route' : 'Ask Campus Companion'}
            </button>
          </header>

          <div className="map-top">
            {originStatus === 'loading' && originSlow ? (
              <section className="map-panel" aria-label="Walking route">
                <span className="map-placeholder-line" />
                <span className="map-placeholder-line is-wide" />
              </section>
            ) : (
              <RoutePanel
                origin={origin}
                originStatus={originStatus}
                selected={selected}
                route={route}
                onChangeStart={() => setPickerOpen((open) => !open)}
                startButtonRef={startButtonRef}
                pickerOpen={pickerOpen}
                picker={picker}
              />
            )}
            {/* The list below is the accessible equivalent of the map (28A). */}
            <div className="map-frame" aria-hidden="true">
              {originResolved && !(list.status === 'loading' && listSlow) ? (
                <CampusMap
                  origin={origin}
                  places={places}
                  selected={selected?.place || null}
                  route={route.status === 'ok' ? route.data : null}
                />
              ) : (
                <div className="map-canvas map-canvas-empty" />
              )}
            </div>
          </div>

          <div className="map-filters" role="group" aria-label="Place categories">
            {chips.map((chip) => (
              <button
                type="button"
                key={chip.id || 'all'}
                className={`map-chip ${chip.id === category ? 'is-on' : ''}`.trim()}
                aria-pressed={chip.id === category}
                onClick={() => chooseCategory(chip.id)}
              >
                {chipLabel(chip.id)}
                <span className="map-chip-count">{chip.count}</span>
              </button>
            ))}
          </div>

          <section className="map-list" aria-label={`${chipLabel(category ?? '')} nearest first`}>
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
                <p>No {pluralName(category)} on the campus map</p>
                {category && (
                  <button type="button" className="map-btn" onClick={() => chooseCategory('')}>Show all</button>
                )}
              </div>
            )}

            {list.status !== 'error' && places.length > 0 && (
              <>
                <ul className="map-rows">
                  {visible.map((place) => {
                    const isSelected = place.id === selectedId;
                    return (
                      <li className={`map-row ${isSelected ? 'is-selected' : ''}`.trim()} key={place.id}>
                        <button
                          type="button"
                          className="map-row-main"
                          aria-pressed={isSelected}
                          onClick={() => setSelected({ place, label: null })}
                        >
                          <span className="map-row-dot" aria-hidden="true" />
                          <span className="map-row-text">
                            <span className="map-row-name">{place.name}</span>
                            <span className="map-row-hours">{hoursLine(place, timezone)}</span>
                          </span>
                          {place.walk_minutes === 0 && place.distance_m === 0 ? (
                            <span className="map-row-walk">
                              <span className="map-row-distance">Your starting place</span>
                            </span>
                          ) : typeof place.walk_minutes === 'number' && (
                            <span className="map-row-walk">
                              <span className="map-row-minutes">{place.walk_minutes} min</span>
                              {typeof place.distance_m === 'number' && (
                                <span className="map-row-distance">{formatDistance(place.distance_m)} walk</span>
                              )}
                            </span>
                          )}
                        </button>
                        <SaveButton item={{ kind: 'place', key: place.id, display_name: place.name }} />
                      </li>
                    );
                  })}
                </ul>
                {moreCount > 0 && (
                  <button type="button" className="map-btn map-more" onClick={() => setExpanded(true)}>
                    See {moreCount} more {pluralName(category)}
                  </button>
                )}
              </>
            )}
          </section>

          <p className="map-footnote">
            Places and walking routes from OpenStreetMap. Map data{' '}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
              {OSM_ATTRIBUTION}
            </a>
            {routeAttribution ? `. ${routeAttribution}` : ''}
          </p>
        </div>
      </main>

      {isSettingsOpen && (
        <SettingsModal
          user={user}
          authToken={authToken}
          onUserUpdate={handleUserUpdate}
          onSignOut={handleSignOutClick}
          advisors={advisors}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
    </div>
  );
};

export default CampusMapPage;
