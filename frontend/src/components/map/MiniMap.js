import React from 'react';
import { Icon } from '../icons';
import './MiniMap.css';

/**
 * A still map centred on one point: a 3×3 block of OpenStreetMap tiles
 * (no Leaflet), with a round pin in the middle. Decorative; the venue name and
 * Directions beside it carry the meaning. OSM's tile policy asks for the
 * attribution, so it stays.
 */

export const TILE_URL = 'https://tile.openstreetmap.org';
const TILE = 256;

/** Global pixel position of lat/lon at `zoom` (Web Mercator). */
export function pixelOf(lat, lon, zoom) {
  const scale = TILE * 2 ** zoom;
  const x = ((Number(lon) + 180) / 360) * scale;
  const rad = (Number(lat) * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * scale;
  return { x, y };
}

export default function MiniMap({ lat, lon, zoom = 17, icon = 'location_on' }) {
  if (lat == null || lon == null) return null;
  const { x, y } = pixelOf(lat, lon, zoom);
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  const tiles = [];
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      const col = tx + dx;
      const row = ty + dy;
      tiles.push(
        <img
          key={`${col}-${row}`}
          className="mini-map-tile"
          src={`${TILE_URL}/${zoom}/${col}/${row}.png`}
          alt=""
          draggable="false"
          style={{ left: `calc(50% + ${Math.round(col * TILE - x)}px)`, top: `calc(50% + ${Math.round(row * TILE - y)}px)` }}
        />,
      );
    }
  }
  return (
    <div className="mini-map" aria-hidden="true">
      <div className="mini-map-tiles">{tiles}</div>
      <span className="mini-map-pin"><Icon name={icon} size={24} filled /></span>
      <span className="mini-map-credit">© OpenStreetMap</span>
    </div>
  );
}
