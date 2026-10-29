import {
  EARLIER, nthSemester, routeByTerm, routeModel, startTermOf,
} from './routeModel';
import { degree, planCourses } from './routeFixture';

describe('routeModel', () => {
  const model = routeModel(degree, planCourses, { start_term: 'Fall 2025' });
  const line = (name) => model.lines.find((l) => l.name === name);

  test('lines come from the program, in order, with the course colours', () => {
    expect(model.lines.map((l) => [l.name, l.tone])).toEqual([
      ['Foundations', 'c1'], ['Core theory', 'c2'], ['Electives', 'c3'],
    ]);
  });

  test('stop states: done, this term and planned', () => {
    expect(line('Foundations').stops.map((s) => [s.id, s.state, s.term])).toEqual([
      ['MATH 1210', 'done', EARLIER],
      ['ECON 2010', 'done', 'Fall 2025'],
      ['STAT 2120', 'now', 'Fall 2026'],
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

  test('terms run from Earlier through every regular term to the deadline', () => {
    expect(model.terms).toEqual([
      EARLIER, 'Fall 2025', 'Spring 2026', 'Fall 2026', 'Spring 2027', 'Fall 2027', 'Spring 2028',
    ]);
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
      EARLIER, 'Fall 2025', 'Spring 2026', 'Fall 2026', 'Spring 2027', 'Fall 2027', 'Spring 2028',
    ]);
    const fall = terms.find((t) => t.term === 'Fall 2026');
    expect(fall).toMatchObject({ now: true, credits: 7, state: 'now' });
    expect(terms.find((t) => t.term === 'Spring 2028').due).toBe(true);
    expect(terms.find((t) => t.term === 'Fall 2025').state).toBe('done');
    expect(open.map((o) => [o.line, o.open, o.rules])).toEqual([
      ['Foundations', 1, ['Introductory economics']], ['Electives', 2, ['Economics electives']],
    ]);
  });
});
