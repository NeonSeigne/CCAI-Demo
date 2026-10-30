/**
 * How a walk reads. Minutes come from the backend (`walk_minutes`, measured
 * from the student's start place); 0 means the start place itself.
 */

/** False for "(Online)", "Zoom" and the like: nowhere to walk to. */
export function hasPhysicalLocation(location) {
  return Boolean(location) && !/\b(online|virtual|zoom|webinar|teams|livestream)\b/i.test(location);
}

const known = (minutes) => minutes != null && minutes !== '' && Number.isFinite(Number(minutes)) && Number(minutes) >= 0;

/**
 * {value, unit} for a walk tile: {value: "9", unit: "min"}, {value: "Here",
 * unit: null} at the start place, null when the walk is unknown. Never "0 min".
 */
export function walkParts(minutes, { here = 'Here' } = {}) {
  if (!known(minutes)) return null;
  const value = Math.round(Number(minutes));
  if (value === 0) return { value: here, unit: null };
  return { value: String(value), unit: 'min' };
}

/**
 * "9 min", "Here" for the start place, null when unknown (render nothing).
 * `here` and `suffix` keep a screen's own wording ("Your starting place",
 * " walk") until its lane moves it to the mockups'.
 */
export function walkText(minutes, { here = 'Here', suffix = '' } = {}) {
  const parts = walkParts(minutes, { here });
  if (!parts) return null;
  return parts.unit ? `${parts.value} ${parts.unit}${suffix}` : parts.value;
}

/** True when the walk is to the start place itself. */
export const isHere = (minutes) => known(minutes) && Math.round(Number(minutes)) === 0;

/** "560 m" or "1.2 km"; null when the distance is unknown. */
export function distanceText(metres) {
  if (typeof metres !== 'number' || Number.isNaN(metres)) return null;
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}
