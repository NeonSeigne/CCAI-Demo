import React from 'react';
import { ExternalLink, Footprints, MapPin } from 'lucide-react';

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

/** Places found by find_place, with the walking estimate when there's an origin. */
export default function PlaceCard({ visual }) {
  const places = visual?.places || [];
  if (!places.length) return null;
  const origin = visual.from;

  return (
    <section className="cc-card cc-places" aria-label="Places">
      {places.map((place, index) => (
        <div key={`${place.name}-${index}`} className={`cc-place ${index === 0 ? 'cc-place--top' : ''}`}>
          <span className="cc-place-pin" aria-hidden="true">
            <MapPin size={16} />
          </span>
          <div className="cc-place-body">
            <strong>{place.name}</strong>
            <span className="cc-place-meta">
              {CATEGORY_LABELS[place.category] || 'Place'}
              {origin ? ` · from ${origin.name}` : ''}
            </span>
          </div>
          {place.walk_minutes_estimate != null && (
            <span className="cc-place-walk">
              <Footprints size={14} aria-hidden="true" />
              <span>
                <strong>~{place.walk_minutes_estimate} min</strong>
                <small>{Math.round(place.distance_m)} m straight line</small>
              </span>
            </span>
          )}
          {place.map_url && (
            <a className="cc-chip-btn" href={place.map_url} target="_blank" rel="noopener noreferrer">
              Map <ExternalLink size={12} aria-hidden="true" />
            </a>
          )}
        </div>
      ))}
      {origin && <p className="cc-card-foot">Walking times are estimates from straight-line distance.</p>}
    </section>
  );
}
