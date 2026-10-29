import React from 'react';
import { ArrowRight, ExternalLink, Icon } from '../icons';
import ContextLink from '../ContextLink';
import SaveButton from '../SaveButton';
import MiniMap from '../map/MiniMap';
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

function mapLabel(url = '') {
  return url.includes('openstreetmap.org') ? 'Open in OpenStreetMap' : 'Open map';
}

/** /map?from=<origin id>&to=<place id>, the walk on the Campus map page (14A). */
export function mapPageLink(origin, place) {
  const params = new URLSearchParams();
  if (origin?.id) params.set('from', origin.id);
  params.set('to', place.id);
  return `/map?${params.toString()}`;
}

function KindIcon({ category }) {
  if (category === 'dining') return <Icon name="restaurant" size={18} />;
  if (category === 'library') return <Icon name="menu_book" size={18} />;
  if (category === 'academic') return <Icon name="school" size={18} />;
  return <Icon name="location_on" size={18} />;
}

/** Places found by find_place, one card each: the map, the place, the walk when there's an origin. */
export default function PlaceCard({ visual }) {
  const places = visual?.places || [];
  if (!places.length) return null;
  const origin = visual.from;

  return (
    <section className="vc-places" aria-label="Places">
      {places.map((place, index) => {
        const walking = origin && place.walk_minutes_estimate != null;
        const hasMap = place.lat != null && place.lon != null;
        return (
          <div key={place.id || `${place.name}-${index}`} className={`vc-card vc-place ${hasMap ? '' : 'is-plain'}`.trim()}>
            {hasMap && (
              <div className="vc-place-map">
                <MiniMap lat={place.lat} lon={place.lon} />
              </div>
            )}
            <div className="vc-place-body">
              <span className="vc-place-kind">
                <KindIcon category={place.category} />
                {CATEGORY_LABELS[place.category] || 'Place'}
              </span>
              <div className="vc-place-top">
                <h3>{place.name}</h3>
                <SaveButton className="vc-save" item={place.id ? { kind: 'place', key: place.id, display_name: place.name } : null} />
              </div>
              {walking && (
                <div className="vc-place-tiles">
                  <div className="vc-tile">
                    <span>{`from ${origin.name}`}</span>
                    <b>~{place.walk_minutes_estimate} min</b>
                    {place.distance_m != null && <small>{Math.round(place.distance_m)} m straight line</small>}
                  </div>
                </div>
              )}
              <div className="vc-place-acts">
                {place.id && (
                  <ContextLink className="vc-btn is-primary" to={mapPageLink(origin, place)}>
                    <Icon name="map" size={20} />
                    Open on map <ArrowRight size={18} aria-hidden="true" />
                  </ContextLink>
                )}
                {place.map_url && (
                  <a className="vc-btn" href={place.map_url} target="_blank" rel="noopener noreferrer">
                    {mapLabel(place.map_url)} <ExternalLink size={16} aria-hidden="true" />
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
