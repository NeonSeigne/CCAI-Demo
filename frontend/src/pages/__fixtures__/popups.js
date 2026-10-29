/* Pop-up payloads shaped like /api/catalog/{id}, /api/events and /api/places/{id}. */
import { cuCourse, uvaCourse, uwCourse } from './catalog';

export function uwPopupCourse() {
  return {
    ...uwCourse('COMP SCI 400', 'Programming III', 3.41),
    description: 'The third course in our programming fundamentals sequence.',
    credits: { min: 3, max: 3 },
    gen_ed: ['Natural Science breadth'],
    grade_history: [
      { term: 'Fall 2023', gpa: 2.97, students: 571, pct_a: 30, pct_df: 9 },
      { term: 'Spring 2024', gpa: 3.35, students: 540, pct_a: 45, pct_df: 5 },
      { term: 'Fall 2024', gpa: 3.44, students: 602, pct_a: 52, pct_df: 4 },
    ],
    prereq_tree: {
      kind: 'all',
      children: [
        {
          kind: 'any',
          children: [
            { kind: 'course', course: 'COMP SCI 300', timing: 'before' },
            { kind: 'course', course: 'COMP SCI 367', timing: 'before' },
          ],
        },
        { kind: 'course', course: 'MATH 240', timing: 'before' },
      ],
    },
    next_courses: [{ identifier: 'COMP SCI 537', title: 'Operating Systems' }],
  };
}

export function uvaPopupCourse() {
  return {
    ...uvaCourse(),
    grade_history: [
      { term: 'Fall 2024', gpa: 2.94, students: 415, pct_a: 30, pct_df: 9 },
      { term: 'Spring 2025', gpa: 3.21, students: 396, pct_a: 40, pct_df: 6 },
    ],
    instructor_grades: [
      { name: 'Ada Byron', gpa: 3.31, students: 800 },
      { name: 'Nate McBurney', gpa: 3.02, students: 400 },
    ],
  };
}

export const cuPopupCourse = cuCourse;

export const uvaEvent = {
  id: '2026-10-28:jazz',
  title: 'UVA Jazz Ensemble: Fall Concert',
  start: '2026-10-28T23:30:00Z',
  end: '2026-10-29T01:00:00Z',
  all_day: false,
  location: 'Old Cabell Hall',
  url: 'https://events.virginia.edu/jazz',
  description: 'The UVA Jazz Ensemble closes its fall season.\n\nDoors open at 7:00 PM.',
  calendar: 'Arts at UVA',
  ongoing: false,
  image_url: 'https://example.org/jazz.jpg',
  categories: ['Music', 'Performance'],
  details: {
    event_type: 'Concert',
    hosted_by: 'McIntire Dept. of Music',
    room: 'Auditorium',
    cost: 'Free',
    registration_url: 'https://example.org/register',
  },
  place_id: 'old-cabell',
  walk_minutes: 9,
};

export const uwEvent = {
  id: '2026-10-28:colloquium',
  title: 'Physics Colloquium',
  start: '2026-10-28T20:30:00Z',
  end: '2026-10-28T21:30:00Z',
  all_day: false,
  location: '2241 Chamberlin',
  url: '',
  description: 'Dark matter outweighs ordinary matter five to one.',
  calendar: 'Physics Department Events',
  ongoing: false,
};

export const richPlace = {
  id: 'alderman',
  name: 'Alderman Library',
  category: 'library',
  lat: 38.0364,
  lon: -78.5051,
  hours: 'Mo-Th 07:30-02:00; Fr 07:30-21:00; Sa 10:00-21:00; Su 10:00-02:00',
  open_now: true,
  open_until: '2026-10-29T06:00:00Z',
  walk_minutes: 6,
  distance_m: 450,
  operator: 'University of Virginia Library',
  building_levels: '5',
  wheelchair: 'yes',
  address: '160 McCormick Rd',
  website: 'https://library.virginia.edu',
  phone: '+1 434 924 3021',
  photo: {
    url: 'https://upload.wikimedia.org/alderman.jpg',
    author: 'Jane Photographer',
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Alderman.jpg',
  },
  aliases: [],
  map_url: 'https://www.openstreetmap.org/way/1',
};

export const sparsePlace = {
  id: 'monroe',
  name: 'Monroe Hall',
  category: 'academic',
  lat: 38.035,
  lon: -78.506,
  hours: null,
  open_now: null,
  walk_minutes: 4,
  distance_m: 300,
  address: '248 McCormick Rd',
  aliases: [],
  map_url: 'https://www.openstreetmap.org/way/2',
};
