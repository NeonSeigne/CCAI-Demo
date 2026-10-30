import React from 'react';
import {
  act, fireEvent, render, screen, waitFor,
} from '@testing-library/react';
import {
  CourseTiles, GradeBars, PrereqTags, SectionRows, clearCourseCache, courseFacts, difficultyFromRow,
  gradeGroups, loadCourse, memoryAdapter, seatTag, setCourseAdapter, useCourse, useCourseFacts, useCourses,
} from '.';
import { cuCourse, uvaCourse, uwCourse } from '../../pages/__fixtures__/catalog';

let mockToken = 'token';
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ authToken: mockToken }) }));

afterEach(() => {
  setCourseAdapter(null);
  clearCourseCache();
  mockToken = 'token';
});

const groups = (payload) => gradeGroups(payload.grades.distribution, payload.grades.buckets)
  .map((g) => `${g.label} ${Math.round(g.pct)}${g.top ? '*' : ''}`);

describe('grade groups per school', () => {
  test('UW keeps AB and BC and merges D and F', () => {
    expect(groups(uwCourse())).toEqual(['A 25', 'AB 23', 'B 35*', 'BC 7', 'C 4', 'D/F 6']);
  });

  test('UVA folds +/− into the letter and keeps DFW by its name', () => {
    const uva = uvaCourse();
    expect(groups(uva)).toEqual(['A 41', 'B 43*', 'C 10', 'DFW 7']);
    const total = gradeGroups(uva.grades.distribution).reduce((sum, g) => sum + g.count, 0);
    expect(total).toBe(610);
  });

  test('another school merges D and F only when both are separate', () => {
    expect(gradeGroups({ 'A-': 10, B: 20, C: 5, D: 3, F: 2 }).map((g) => g.label)).toEqual(['A', 'B', 'C', 'D/F']);
    expect(gradeGroups({ A: 10, B: 20, D: 3 }).map((g) => g.label)).toEqual(['A', 'B', 'D']);
    expect(gradeGroups({ A: 10, W: 4 }).map((g) => g.label)).toEqual(['A', 'W']);
  });

  test('no grades: CU publishes none, empty distributions give nothing', () => {
    const facts = courseFacts(cuCourse());
    expect(facts.grades).toBeNull();
    expect(facts.gpa).toBeNull();
    expect(gradeGroups({})).toEqual([]);
    expect(gradeGroups({ a: 0 })).toEqual([]);
  });
});

describe('difficulty comes from the backend', () => {
  test('the payload label, never a GPA cutoff', () => {
    const uw = { ...uwCourse('COMP SCI 400', 'Programming III', 3.2), difficulty: 'harder' };
    expect(courseFacts(uw)).toMatchObject({ difficulty: 'harder', difficultyLabel: 'Harder', gpa: '3.20' });
    expect(courseFacts({ ...uw, difficulty: 'easier' }).difficultyLabel).toBe('Easier');
  });

  test('null difficulty hides the label but keeps the GPA', () => {
    const facts = courseFacts({ ...uwCourse(), difficulty: null });
    expect(facts.difficulty).toBeNull();
    expect(facts.difficultyLabel).toBeNull();
    expect(facts.tiles.find((t) => t.key === 'gpa')).toMatchObject({ value: '3.17', tone: null, sub: null });
    expect(courseFacts({ ...uwCourse(), difficulty: 'unknown-word' }).difficulty).toBeNull();
  });

  test('rows with only the planner flag', () => {
    expect(difficultyFromRow({ harder: true })).toBe('harder');
    expect(difficultyFromRow({ harder: false })).toBe('typical');
    expect(difficultyFromRow({ harder: null, avg_gpa: 3.9 })).toBeNull();
    expect(difficultyFromRow({ harder: false, difficulty: 'easier' })).toBe('easier');
  });
});

describe('tiles', () => {
  test('a tile with no data is left out', () => {
    expect(courseFacts(cuCourse()).tiles).toEqual([]);
    const keys = courseFacts({ ...uwCourse(), difficulty: 'typical' }).tiles.map((t) => t.key);
    expect(keys).toEqual(['gpa', 'seats', 'a', 'df', 'students']);
  });

  test('snapshot seats get no Seats tile; UVA labels its DFW share', () => {
    const facts = courseFacts(uvaCourse());
    expect(facts.tiles.map((t) => t.key)).toEqual(['gpa', 'a', 'df', 'students']);
    expect(facts.tiles.find((t) => t.key === 'df').label).toBe('DFW');
  });

  test('the instructor rating from the ratings payload, hidden when nobody is rated', () => {
    const rated = courseFacts(uwCourse(), { ratings: { instructor_rating: { rating: 3.64, instructors: 2, term: 'Spring 2027' } } });
    expect(rated.tiles.find((t) => t.key === 'rating')).toMatchObject({ label: 'Instructor rating', value: '3.6' });
    expect(courseFacts(uwCourse(), { ratings: { instructor_rating: null } }).rating).toBeNull();
  });

  test('CourseTiles draws the named tiles and leaves out missing ones', () => {
    render(<CourseTiles tiles={courseFacts({ ...uwCourse(), difficulty: 'harder' }).tiles} />);
    expect(screen.getByText('Avg GPA')).toBeInTheDocument();
    expect(screen.getByText('Seats open')).toBeInTheDocument();
    expect(screen.queryByText('Instructor rating')).not.toBeInTheDocument();
    expect(screen.getByText(/Harder/)).toBeInTheDocument();
  });
});

describe('sections', () => {
  test('live seats and waitlists', () => {
    const live = { seats_published: true, historical: false };
    expect(seatTag({ seats_open: 84, is_open: true }, live)).toEqual({ text: '84 seats', kind: 'seats' });
    expect(seatTag({ seats_open: 0, waitlist: 4, is_open: false }, live)).toEqual({ text: '4 waiting', kind: 'waiting' });
    expect(seatTag({ seats_open: 0, is_open: false }, live)).toEqual({ text: 'Full', kind: 'full' });
  });

  test('snapshot seats read enrolled of limit with the term, never seats or waiting', () => {
    const facts = courseFacts(uvaCourse());
    expect(facts.sections.rows[0].tag).toEqual({ text: '288 of 300 · Fall 2026', kind: 'snapshot' });
    const withWaitlist = { ...uvaCourse().sections, rows: [{ section: '001', enrolled: 41, capacity: 60, seats_open: 19, waitlist: 3 }] };
    expect(seatTag(withWaitlist.rows[0], withWaitlist).text).toBe('41 of 60 · Fall 2026');
  });

  test('no seats published (CU): no tag; meeting times read as days and clock', () => {
    const cu = cuCourse();
    cu.sections.rows[0].meeting_times = [
      { day: 'Mo', start: '09:30', end: '10:45' }, { day: 'We', start: '09:30', end: '10:45' },
    ];
    const facts = courseFacts(cu);
    expect(facts.sections.rows[0]).toMatchObject({ name: 'LEC 100', tag: null, when: 'MoWe 9:30–10:45', instructors: 'Pat Doe' });
    render(<SectionRows sections={facts.sections} />);
    expect(screen.getByText('LEC 100')).toBeInTheDocument();
    expect(screen.getByText('MoWe 9:30–10:45')).toBeInTheDocument();
  });

  test('SectionRows tags snapshot rows with the neutral tag', () => {
    render(<SectionRows sections={courseFacts(uvaCourse()).sections} />);
    expect(screen.getByText('288 of 300 · Fall 2026')).toHaveClass('crs-tag--snapshot');
  });
});

describe('prerequisites', () => {
  test('tree leaves with the student states', () => {
    const payload = {
      identifier: 'COMP SCI 400',
      prereq_tree: { kind: 'all', children: [{ kind: 'course', course: 'COMP SCI 300' }, { kind: 'course', course: 'MATH 240' }] },
    };
    const facts = courseFacts(payload, { states: { 'COMP SCI 300': 'done', 'MATH 240': 'now' } });
    expect(facts.prereqs.map((p) => `${p.id}:${p.state}`)).toEqual(['COMP SCI 300:done', 'MATH 240:now']);
    const onOpen = jest.fn();
    render(<PrereqTags prereqs={facts.prereqs} onOpen={onOpen} />);
    const tag = screen.getByRole('button', { name: /^MATH 240/ });
    expect(tag).toHaveTextContent('MATH 240, This term');
    fireEvent.click(tag);
    expect(onOpen).toHaveBeenCalledWith('MATH 240');
  });

  test('named courses when there is no tree (UVA), none at CU', () => {
    expect(courseFacts(uwCourse()).prereqs).toEqual([{ id: 'COMP SCI 200', title: null, timing: null, state: null }]);
    expect(courseFacts(cuCourse()).prereqs).toEqual([]);
  });
});

describe('GradeBars', () => {
  test('the largest group fills the box and is marked', () => {
    const { container } = render(<GradeBars groups={courseFacts(uvaCourse()).grades.groups} size="chat" />);
    const bars = screen.getAllByRole('listitem');
    expect(bars.map((li) => li.textContent)).toEqual(['41%A', '43%B', '10%C', '7%DFW']);
    expect(bars[1]).toHaveClass('is-top');
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    expect(container.querySelector('.is-top .crs-bar-fill')).toHaveStyle({ height: '100%' });
  });

  test('no groups, no bars', () => {
    const { container } = render(<GradeBars groups={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('loader', () => {
  function Probe({ id }) {
    const { data, error, loading } = useCourse(id);
    if (loading) return <p>loading</p>;
    if (error) return <p>{`error ${error.status || ''}`}</p>;
    return <p>{data?.title || 'none'}</p>;
  }

  test('one request per course, shared by every reader', async () => {
    const adapter = memoryAdapter({ courses: { 'CS 2100': uvaCourse() } });
    setCourseAdapter(adapter);
    render(<><Probe id="CS 2100" /><Probe id="cs 2100" /></>);
    expect(await screen.findAllByText('Data Structures and Algorithms 1')).toHaveLength(2);
    expect(adapter.calls).toEqual([{ kind: 'course', id: 'CS 2100' }]);
  });

  test('a failure is not kept, so retry asks again', async () => {
    let fail = true;
    const adapter = memoryAdapter({ courses: { 'CS 2100': () => (fail ? Object.assign(new Error('down'), { status: 503 }) : uvaCourse()) } });
    setCourseAdapter(adapter);
    function Retry() {
      const { data, error, retry } = useCourse('CS 2100');
      return error ? <button type="button" onClick={retry}>Retry</button> : <p>{data?.title || '…'}</p>;
    }
    render(<Retry />);
    const button = await screen.findByRole('button', { name: 'Retry' });
    fail = false;
    fireEvent.click(button);
    expect(await screen.findByText('Data Structures and Algorithms 1')).toBeInTheDocument();
    expect(adapter.calls).toHaveLength(2);
  });

  test('an unknown course reads as not found', async () => {
    setCourseAdapter(memoryAdapter({}));
    render(<Probe id="NOPE 100" />);
    expect(await screen.findByText('error 404')).toBeInTheDocument();
  });

  test('signing out clears the cache; the next student loads afresh', async () => {
    const adapter = memoryAdapter({ courses: { 'CS 2100': uvaCourse() } });
    setCourseAdapter(adapter);
    const view = render(<Probe id="CS 2100" />);
    await screen.findByText('Data Structures and Algorithms 1');
    mockToken = null;
    view.rerender(<Probe id="CS 2100" />);
    expect(await screen.findByText('none')).toBeInTheDocument();
    mockToken = 'other-student';
    view.rerender(<Probe id="CS 2100" />);
    await screen.findByText('Data Structures and Algorithms 1');
    expect(adapter.calls).toHaveLength(2);
  });

  test('a different token starts a fresh cache even without a sign-out in between', async () => {
    const adapter = memoryAdapter({ courses: { 'CS 2100': uvaCourse() } });
    setCourseAdapter(adapter);
    await loadCourse('a', 'CS 2100');
    await loadCourse('a', 'CS 2100');
    await loadCourse('b', 'CS 2100');
    expect(adapter.calls).toHaveLength(2);
  });

  test('useCourseFacts adds the instructor rating for a term', async () => {
    const adapter = memoryAdapter({
      courses: { 'CS 2100': { ...uvaCourse(), difficulty: 'typical' } },
      ratings: { 'CS 2100': { ratings: [], instructor_rating: { rating: 4.1, instructors: 1, term: 'Spring 2027' } } },
    });
    setCourseAdapter(adapter);
    function Facts() {
      const { facts } = useCourseFacts('CS 2100', { ratings: true, term: 'Spring 2027' });
      return <p>{facts ? `${facts.difficultyLabel} ${facts.rating?.rating || '-'}` : '…'}</p>;
    }
    render(<Facts />);
    expect(await screen.findByText('Typical 4.1')).toBeInTheDocument();
    expect(adapter.calls).toContainEqual({ kind: 'ratings:Spring 2027', id: 'CS 2100' });
  });

  test('useCourses fills in many courses and marks failures', async () => {
    setCourseAdapter(memoryAdapter({ courses: { 'CS 2100': uvaCourse() }, ratings: { 'CS 2100': { ratings: [{ name: 'Ada Byron' }] } } }));
    let latest;
    function Many() {
      latest = useCourses(['CS 2100', 'NOPE 1']);
      return null;
    }
    render(<Many />);
    await waitFor(() => expect(latest['CS 2100']?.ratings).toHaveLength(1));
    expect(latest['NOPE 1']).toEqual({ summary: null, error: true });
    await act(async () => {});
  });
});
