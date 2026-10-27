// The backend writes datetime.utcnow().isoformat(): UTC with no zone suffix.
// new Date() reads a bare ISO date-time as local time, so mark it as UTC first.
const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** Parses a backend timestamp; zoneless ISO strings are treated as UTC. */
export function parseServerTime(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'string' && ISO_DATE_TIME.test(value) && !HAS_ZONE.test(value)) {
    return new Date(`${value}Z`);
  }
  return new Date(value);
}
