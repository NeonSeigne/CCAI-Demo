/* Catalog responses shaped like backend/app/api/routes/catalog.py at UW, UVA and CU. */

export const UW_CAPS = {
  keyword_search: true, seat_filter: false, grades: true, sections: true, seats: true,
  seats_historical: false, instructors: true, prerequisites: true, next_courses: true,
};
export const UVA_CAPS = {
  keyword_search: true, seat_filter: true, grades: true, sections: true, seats: true,
  seats_historical: true, instructors: true, prerequisites: false, next_courses: false,
};
export const CU_CAPS = {
  keyword_search: false, seat_filter: false, grades: false, sections: true, seats: false,
  seats_historical: false, instructors: true, prerequisites: false, next_courses: false,
};

export const UW_SOURCE = { name: 'UW Course Map', url: 'https://uwcourses.com' };
export const UVA_SOURCE = { name: 'theCourseForum', url: 'https://thecourseforum.com' };
export const CU_SOURCE = { name: 'CU Boulder Class Search', url: 'https://classes.colorado.edu' };

const lecture = (section, enrolled, capacity) => ({
  section, type: 'LEC', instructors: 'Jim Williams', enrolled, capacity,
  seats_open: Math.max(capacity - enrolled, 0), is_open: enrolled < capacity,
});

export function uwCourse(identifier = 'COMP SCI 300', title = 'Programming II', gpa = 3.17) {
  return {
    identifier,
    title,
    description: '',
    instructors: ['Jim Williams'],
    capabilities: UW_CAPS,
    source: UW_SOURCE,
    as_of: null,
    grades: {
      gpa,
      students: 486,
      pct_a: 48,
      pct_df: 5,
      distribution: { a: 120, ab: 112, b: 170, bc: 34, c: 20, d: 20, f: 10 },
      term: 'Spring 2026',
      labels: { a: 'A/AB', df: 'D/F' },
    },
    cumulative: { gpa: 3.29, students: 9000, pct_a: 50, pct_df: 4, distribution: {} },
    sections: {
      term: 'Spring 2027',
      historical: false,
      seats_published: true,
      as_of: null,
      seats_open: 8,
      rows: [lecture('001', 96, 100), lecture('002', 96, 100), lecture('003', 100, 100)],
    },
    prerequisites: { text: 'COMP SCI 200 or placement.', courses: [{ identifier: 'COMP SCI 200', title: '' }] },
    next_courses: [{ identifier: 'COMP SCI 400', title: 'Programming III' }, { identifier: 'COMP SCI 354', title: 'Machine Organization' }],
  };
}

export function uvaCourse() {
  return {
    identifier: 'CS 2100',
    title: 'Data Structures and Algorithms 1',
    description: '',
    instructors: ['Ada Byron'],
    capabilities: UVA_CAPS,
    source: UVA_SOURCE,
    as_of: '2026-09-03',
    grades: {
      gpa: 3.12,
      students: 610,
      pct_a: 41,
      pct_df: 6,
      distribution: { 'A+': 50, A: 150, 'A-': 50, 'B+': 100, B: 100, 'B-': 60, 'C+': 30, C: 20, 'C-': 10, DFW: 40 },
      term: 'Spring 2026',
      labels: { a: 'A range', df: 'DFW' },
      as_of: '2026-09-03',
    },
    cumulative: { gpa: 3.2, students: 4000, pct_a: 45, pct_df: 5, distribution: {} },
    sections: {
      term: 'Fall 2026',
      historical: true,
      seats_published: true,
      as_of: '2026-09-03',
      seats_open: 12,
      rows: [lecture('001', 288, 300)],
    },
  };
}

export function cuCourse() {
  return {
    identifier: 'CSCI 1300',
    title: 'Computer Science 1: Starting Computing',
    description: '',
    capabilities: CU_CAPS,
    source: CU_SOURCE,
    as_of: null,
    sections: {
      term: 'Spring 2026',
      historical: false,
      seats_published: false,
      as_of: null,
      seats_open: null,
      rows: [
        { section: '100', type: 'LEC', instructors: 'Pat Doe', enrolled: null, capacity: null, seats_open: null, is_open: null },
        { section: '110', type: 'REC', instructors: 'Sam Roe', enrolled: null, capacity: null, seats_open: null, is_open: null },
      ],
    },
    instructors: ['Pat Doe', 'Sam Roe'],
  };
}

export const row = (identifier, title, extra = {}) => ({ identifier, title, description: '', level: null, ...extra });
