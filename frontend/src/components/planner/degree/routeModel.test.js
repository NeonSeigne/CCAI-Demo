import {
  degreeCounts, firstStop, graduationOf, nthSemester, routeByTerm, routeModel, startTermOf,
} from './routeModel';
import { degree, planCourses } from './routeFixture';

describe('routeModel', () => {
  const model = routeModel(degree, planCourses, { start_term: 'Fall 2025' });
  const line = (name) => model.lines.find((l) => l.name === name);

  test('lines come from the program, in order, with the line colours', () => {
    expect(model.lines.map((l) => [l.name, l.tone])).toEqual([
      ['Foundations', 'l1'], ['Core theory', 'l2'], ['Electives', 'l3'],
    ]);
    // One colour per requirement: every rule takes its line's colour.
    expect(model.ruleTones).toMatchObject({ 'econ-ba:calculus': 'l1', 'econ-ba:metrics': 'l2', 'econ-ba:el': 'l3' });
  });

  test('stop states: done, this term and planned', () => {
    // A completed course with no term sits in the first column, its term unknown.
    expect(line('Foundations').stops.map((s) => [s.id, s.state, s.term, s.termKnown])).toEqual([
      ['ECON 2010', 'done', 'Fall 2025', true],
      ['MATH 1210', 'done', 'Fall 2025', false],
      ['STAT 2120', 'now', 'Fall 2026', true],
    ]);
    expect(line('Core theory').stops.map((s) => s.state)).toEqual(['now', 'planned', 'planned']);
  });

  test('two stops can share a term on one line', () => {
    const spring = line('Core theory').stops.filter((s) => s.term === 'Spring 2027');
    expect(spring.map((s) => s.id)).toEqual(['ECON 3020', 'ECON 3720']);
  });

  test('a course rides the first line that took it only', () => {
    expect(line('Electives').stops.map((s) => s.id)).toEqual(['ECON 4210']);
  });

  test('open stops count the courses no plan has chosen', () => {
    expect([line('Foundations').open, line('Core theory').open, line('Electives').open]).toEqual([1, 0, 2]);
    expect(model.notPlaced).toBe(3);
    expect(line('Electives').total).toBe(3);
  });

  test('terms run through every regular term to the deadline, with no Earlier column', () => {
    expect(model.terms).toEqual([
      'Fall 2025', 'Spring 2026', 'Fall 2026', 'Spring 2027', 'Fall 2027', 'Spring 2028',
    ]);
  });

  test('columns run to graduation: the server\'s terms, else the spring of the class year', () => {
    const withTerms = routeModel(
      { ...degree, route: { ...degree.route, terms: ['Fall 2025', 'Spring 2026', 'Fall 2026', 'Spring 2027', 'Fall 2027', 'Spring 2028', 'Fall 2028', 'Spring 2029'] }, graduation: { term: 'Spring 2029', source: 'class_year' } },
      planCourses,
      { start_term: 'Fall 2025' },
    );
    expect(withTerms.terms[withTerms.terms.length - 1]).toBe('Spring 2029');
    expect(withTerms.graduation).toBe('Spring 2029');
    const byYear = routeModel(degree, planCourses, { class_year: '2029' });
    expect(byYear.terms).toEqual([
      'Fall 2025', 'Spring 2026', 'Fall 2026', 'Spring 2027', 'Fall 2027', 'Spring 2028', 'Fall 2028', 'Spring 2029',
    ]);
    expect(graduationOf({}, {})).toBeNull();
  });

  test('requirement rows: dot colour, pills by state and X of N', () => {
    const rows = Object.fromEntries(model.requirements.map((r) => [r.title, r]));
    expect(model.requirements.map((r) => r.title)).toEqual([
      'Introductory economics', 'Calculus I', 'Statistics', 'Intermediate micro', 'Intermediate macro', 'Econometrics',
      'Economics electives',
    ]);
    expect(rows['Introductory economics']).toMatchObject({ tone: 'l1', pills: ['done', 'open'], count: '1 of 2' });
    expect(rows.Statistics).toMatchObject({ pills: ['now'], count: '0 of 1' });
    expect(rows['Intermediate macro']).toMatchObject({ tone: 'l2', pills: ['planned'] });
    expect(rows['Economics electives'].pills).toEqual(['now', 'planned', 'open', 'open']);
  });

  test('a credits rule counts one pill per three credits', () => {
    const credits = {
      ...degree,
      rules: degree.rules.map((r) => (r.rule_id === 'el' ? {
        ...r, unit: 'credits', needed: 12, completed: 3, planned: 3, completed_courses: [], planned_courses: ['ECON 4210'],
      } : r)),
    };
    const row = routeModel(credits, planCourses, {}).requirements.find((r) => r.title === 'Economics electives');
    expect(row.pills).toEqual(['done', 'planned', 'open', 'open']);
    expect(row.count).toBe('3 of 12 cr');
  });

  test('the first stop is the first this-term stop, else the first planned, else none', () => {
    expect(firstStop(model).id).toBe('STAT 2120');
    expect(firstStop(routeModel(degree, [], {}))).toBeNull();
    const notNow = routeModel({ ...degree, term: 'Fall 2024' }, planCourses, {});
    expect(firstStop(notNow).id).toBe('STAT 2120');
    expect(firstStop(notNow).state).toBe('planned');
  });

  test('stops carry what the detail card needs: needs, opens, sections', () => {
    const rich = {
      ...degree,
      terms: degree.terms.map((t) => ({
        ...t,
        courses: t.courses.map((c) => (c.id === 'ECON 3010' ? {
          ...c,
          sections: [{ id: '001', kind: 'Lecture', meetings: [{ day: 'Mo', start: '14:00', end: '15:15' }, { day: 'We', start: '14:00', end: '15:15' }], instructor: 'Troyan' }],
          opens: [{ id: 'ECON 4010', title: 'Game Theory', in_plan: false }],
          opens_complete: false,
        } : c)),
      })),
    };
    const stop = routeModel(rich, planCourses, {}).lines[1].stops.find((s) => s.id === 'ECON 3010');
    expect(stop.needs).toEqual(['ECON 2010', 'ECON 9999']);
    expect(stop.opens.map((o) => o.id)).toEqual(['ECON 4010']);
    expect(stop.opensComplete).toBe(false);
    expect(stop.sections[0].instructor).toBe('Troyan');
    // Without the server's list, opens falls back to plan links and is partial.
    const plain = model.lines[1].stops.find((s) => s.id === 'ECON 3010');
    expect(plain.opens.map((o) => o.id)).toEqual(['ECON 4210']);
    expect(plain.opensComplete).toBe(false);
  });

  test('the deadline counts semesters from the start term', () => {
    expect(model.deadline).toEqual({ term: 'Spring 2028', lines: ['econ-ba:Core theory'] });
  });

  test('without a start term or class year there is no deadline', () => {
    expect(routeModel(degree, planCourses, {}).deadline).toBeNull();
  });

  test('a transfer start term moves the deadline', () => {
    expect(routeModel(degree, planCourses, { start_term: 'Spring 2026' }).deadline.term).toBe('Fall 2028');
  });

  test('edges link stops on the route only', () => {
    expect(model.edges).toEqual([
      { from: 'ECON 2010', to: 'ECON 3010' },
      { from: 'ECON 3010', to: 'ECON 4210' },
    ]);
  });

  test('no route data gives an empty model', () => {
    expect(routeModel({ ...degree, route: undefined }, planCourses).lines).toEqual([]);
    expect(routeModel(null).terms).toEqual([]);
  });
});

describe('start terms', () => {
  test('saved start term, else Fall four years before the class year', () => {
    expect(startTermOf({ start_term: 'Spring 2025', class_year: '2029' })).toBe('Spring 2025');
    expect(startTermOf({ class_year: '2029' })).toBe('Fall 2025');
    expect(startTermOf({})).toBeNull();
  });

  test('nthSemester counts Fall and Spring', () => {
    expect(nthSemester('Fall 2025', 1)).toBe('Fall 2025');
    expect(nthSemester('Fall 2025', 6)).toBe('Spring 2028');
    expect(nthSemester('Spring 2026', 6)).toBe('Fall 2028');
  });
});

describe('routeByTerm', () => {
  test('one entry per term with its stops, credits and the open stops after', () => {
    const { terms, open } = routeByTerm(routeModel(degree, planCourses, { start_term: 'Fall 2025' }));
    expect(terms.map((t) => t.term)).toEqual([
      'Fall 2025', 'Spring 2026', 'Fall 2026', 'Spring 2027', 'Fall 2027', 'Spring 2028',
    ]);
    // Past terms read as past even with no stops.
    expect(terms.find((t) => t.term === 'Spring 2026').state).toBe('done');
    const fall = terms.find((t) => t.term === 'Fall 2026');
    expect(fall).toMatchObject({ now: true, credits: 7, state: 'now' });
    expect(terms.find((t) => t.term === 'Spring 2028').due).toBe(true);
    expect(terms.find((t) => t.term === 'Fall 2025').state).toBe('done');
    expect(open.map((o) => [o.line, o.code, o.title])).toEqual([
      ['Foundations', '····', 'Introductory economics'],
      ['Electives', '····', 'Economics electives'],
      ['Electives', '····', 'Economics electives'],
    ]);
  });

  test('open rows take the slot wording and a subject mask', () => {
    const worded = {
      ...degree,
      route: {
        ...degree.route,
        slots: [{ program_id: 'econ-ba', rule_id: 'el', line: 'Electives', open: 1, wording: 'Any ECON course, 2000 or above', options: [] }],
      },
    };
    const { open } = routeByTerm(routeModel(worded, planCourses, {}));
    expect(open).toEqual([expect.objectContaining({ code: 'ECON ····', title: 'Any ECON course, 2000 or above' })]);
  });

  test('trailing empty terms are left off the phone route', () => {
    const { terms } = routeByTerm(routeModel(degree, planCourses, { class_year: '2029' }));
    expect(terms[terms.length - 1].term).toBe('Spring 2028');
  });
});

describe('degreeCounts', () => {
  test('credits done, this term and planned, and the count not placed', () => {
    expect(degreeCounts(degree, planCourses, 3)).toEqual({
      done: 7, now: 7, planned: 10, notPlaced: 3,
    });
  });
});
