import React from 'react';
import { ExternalLink, MapPin } from 'lucide-react';

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

/** A drawn walk from origin to place; decoration, not a map. */
function WalkSketch() {
  return (
    <div className="cc-walk-sketch" aria-hidden="true">
      <svg viewBox="0 0 300 96" preserveAspectRatio="none">
        <path d="M0 45 H300 M138 0 V96" className="cc-walk-street" />
        <path d="M60 24 L236 72" className="cc-walk-route" />
      </svg>
      <span className="cc-walk-from" />
      <span className="cc-walk-to" />
    </div>
  );
}

/** Places found by find_place, one card each, with the walk when there's an origin. */
export default function PlaceCard({ visual }) {
  const places = visual?.places || [];
  if (!places.length) return null;
  const origin = visual.from;

  return (
    <section className={`cc-places ${places.length > 1 ? 'cc-span' : ''}`} aria-label="Places">
      {places.map((place, index) => {
        const walking = origin && place.walk_minutes_estimate != null;
        return (
          <div key={`${place.name}-${index}`} className="cc-card cc-place">
            {walking && <WalkSketch />}
            <div className="cc-place-top">
              {!walking && (
                <span className="cc-place-pin" aria-hidden="true">
                  <MapPin size={16} />
                </span>
              )}
              <div className="cc-place-body">
                <strong>{place.name}</strong>
                <span className="cc-place-meta">
                  {walking ? `from ${origin.name}` : CATEGORY_LABELS[place.category] || 'Place'}
                </span>
              </div>
              {walking && (
                <span className="cc-place-walk">
                  <strong>~{place.walk_minutes_estimate} min</strong>
                  <small>{Math.round(place.distance_m)} m straight line</small>
                </span>
              )}
            </div>
            {place.map_url && (
              <a className="cc-soft-btn cc-place-map" href={place.map_url} target="_blank" rel="noopener noreferrer">
                {mapLabel(place.map_url)} <ExternalLink size={12} aria-hidden="true" />
              </a>
            )}
          </div>
        );
      })}
    </section>
  );
}
