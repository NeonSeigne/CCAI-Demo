/**
 * Campus module: the school's facts, campus time and walk wording, place
 * hours, and the shared start place. Screens import from here, not from raw
 * config paths or from each other.
 */
export { schoolFacts, useSchool } from './school';
export {
  campusDay, clockTime, countdown, dateLabel, dateParts, durationText, endLine, eventRange,
  eventTime, eventWhen, formatIn, isAllDay, isMultiDay, lastsADay, meetingClock, openingClock,
  rangeParts, spanText, spokenDate,
} from './time';
export {
  distanceText, hasPhysicalLocation, isHere, walkParts, walkText,
} from './walk';
export { openState, openUntil, weekHours } from './hours';
export { StartPlaceProvider, useStartPlace } from './startPlace';
