import React from 'react';
import { Icon } from '../icons';
import ContextLink from '../ContextLink';
import MiniMap from '../map/MiniMap';
import { weeklyHours, weekdayIndex } from '../../utils/osmHours';
import { minutesOfDay } from '../../utils/eventWindows';
import { openState, useSchool, walkParts } from '../../modules/campus';
import '../../styles/CourseVisuals.css';

const CATEGORY_LABELS = {
  academic: 'Building',
  library: 'Library',
  dining: 'Dining',
  health: 'Health',
  housing: 'Housing',
  recreation: 'Recreation',
  arts: 'Arts',
  landmark: 'Landmark',
  transit: 'Bus stop',
  other: 'Place',
};

/** The category's icon, on the map pin and beside the kind (the map page's pins use the same). */
const CATEGORY_ICONS = {
  library: 'local_library',
  dining: 'restaurant',
  academic: 'school',
  housing: 'home',
  recreation: 'fitness_center',
  transit: 'directions_bus',
  health: 'local_hospital',
  arts: 'theater_comedy',
  landmark: 'account_balance',
  other: 'location_on',
};

/** /map?from=<origin id>&to=<place id>, the walk on the Campus map page (14A). */
export function mapPageLink(origin, place) {
  const params = new URLSearchParams();
  if (origin?.id) params.set('from', origin.id);
  params.set('to', place.id);
  return `/map?${params.toString()}`;
}

const CLOCK = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/;

/** "7:30 am" -> 450; null when it isn't a clock. */
function clockMinutes(text) {
  const match = CLOCK.exec(String(text).trim());
  if (!match) return null;
  const h = Number(match[1]) % 12 + (match[3] === 'pm' ? 12 : 0);
  return h * 60 + Number(match[2] || 0);
}

/** [[start, end]] in minutes for one day's hours text ("7:30 am – 2 am, 5 pm – 9 pm"); an end past midnight adds a day. */
function dayRanges(text) {
  if (!text || text === 'Closed' || text === 'Open 24 hours') return [];
  return text.split(', ').map((part) => {
    const [from, to] = part.split(' – ').map(clockMinutes);
    if (from == null || to == null) return null;
    return [from, to <= from ? to + 24 * 60 : to];
  }).filter(Boolean);
}

/**
 * "9 PM": when the place closes, if it is open at `now` (campus time),
 * from the live flags or else its OSM hours. Null when closed, open all day,
 * or the hours aren't listed (the tile is then left out, Q5).
 */
export function openUntilText(place, timezone, now = new Date()) {
  const live = openState(place, timezone);
  if (live.open === true && live.until) return live.until;
  if (live.open === false) return null;
  const week = weeklyHours(place?.hours);
  if (!week) return null;
  const today = weekdayIndex(now, timezone);
  const minute = minutesOfDay(now, timezone);
  const yesterday = (today + 6) % 7;
  const close = [
    ...dayRanges(week[today]?.text).filter(([from, to]) => minute >= from && minute < to).map(([, to]) => to),
    ...dayRanges(week[yesterday]?.text).filter(([, to]) => to > 24 * 60 && minute < to - 24 * 60).map(([, to]) => to - 24 * 60),
  ][0];
  if (close == null) return null;
  const h = Math.floor(close / 60) % 24;
  const m = close % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
}

/** The place card's tiles (chat-campus): Walk, Open until, Access; each left out without data (Q5). */
function placeTiles(place, origin, timezone, now) {
  const tiles = [];
  const walk = origin ? walkParts(place.walk_minutes_estimate) : null;
  if (walk) tiles.push({ key: 'walk', label: 'Walk', value: walk.value, unit: walk.unit });
  const until = openUntilText(place, timezone, now);
  if (until) tiles.push({ key: 'until', label: 'Open until', value: until });
  if (place.access === 'yes') {
    tiles.push({ key: 'access', label: 'Access', icon: 'accessible', spoken: 'Wheelchair accessible' });
  } else if (place.access === 'limited') {
    tiles.push({ key: 'access', label: 'Access', value: 'Limited' });
  }
  return tiles;
}

/** Places found by find_place, one card each: the map, the place, its tiles, Directions and Open in map. */
export default function PlaceCard({ visual, now }) {
  const { timezone } = useSchool();
  const places = visual?.places || [];
  if (!places.length) return null;
  const origin = visual.from;
  const clock = now || new Date();

  return (
    <section className="vc-places" aria-label="Places">
      {places.map((place, index) => {
        const hasMap = place.lat != null && place.lon != null;
        const icon = CATEGORY_ICONS[place.category] || CATEGORY_ICONS.other;
        const tiles = placeTiles(place, origin, timezone, clock);
        return (
          <div key={place.id || `${place.name}-${index}`} className={`vc-card vc-place ${hasMap ? '' : 'is-plain'}`.trim()}>
            {hasMap && (
              <div className="vc-place-map">
                <MiniMap lat={place.lat} lon={place.lon} icon={icon} />
              </div>
            )}
            <div className="vc-place-body">
              <span className="vc-place-kind">
                <Icon name={icon} size={18} />
                {CATEGORY_LABELS[place.category] || 'Place'}
              </span>
              <h3>{place.name}</h3>
              {tiles.length > 0 && (
                <div className="vc-place-tiles" style={{ '--vc-tiles': tiles.length }}>
                  {tiles.map((tile) => (
                    <div key={tile.key} className="vc-tile">
                      <span>{tile.label}</span>
                      <b>
                        {tile.icon ? <Icon name={tile.icon} size={20} label={tile.spoken} /> : tile.value}
                        {tile.unit && <small>{` ${tile.unit}`}</small>}
                      </b>
                    </div>
                  ))}
                </div>
              )}
              <div className="vc-place-acts">
                {place.id && (
                  <ContextLink className="vc-btn is-primary" to={mapPageLink(origin, place)}>
                    <Icon name="directions_walk" size={20} />
                    Directions
                  </ContextLink>
                )}
                {place.map_url && (
                  <a className="vc-btn" href={place.map_url} target="_blank" rel="noopener noreferrer">
                    <Icon name="map" size={20} />
                    Open in map
                  </a>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}
