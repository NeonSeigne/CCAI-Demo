/**
 * Formatting shared by the course pop-up's band, tabs and tiles. Course
 * facts (difficulty, GPA, credits, prerequisites) live in modules/course.
 */
export {
  creditsText, gpaText, pctText, prereqCourses,
} from '../../modules/course/facts';

const SEASON_SHORT = {
  fall: 'Fa', spring: 'Sp', summer: 'Su', winter: 'Wi', january: 'Ja',
};

/** "Fall 2025" -> "Fa 25"; anything else unchanged. */
export function termShort(term) {
  const match = /^(\w+)\s+(\d{4})$/.exec(String(term || '').trim());
  if (!match) return String(term || '');
  const season = SEASON_SHORT[match[1].toLowerCase()];
  return season ? `${season} ${match[2].slice(2)}` : String(term);
}

/** "José Q. O'Neil" -> "jose oneil", for matching ratings to grade rows. */
export function nameKey(name) {
  return String(name || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((part) => part.length > 1)
    .join(' ');
}
