import escapeCurrency from './escapeCurrency';

test('prices are escaped so two of them do not become a formula', () => {
  expect(escapeCurrency('25 hours at $15/hour nets about $1,500/month'))
    .toBe('25 hours at \\$15/hour nets about \\$1,500/month');
  expect(escapeCurrency('$20 a week')).toBe('\\$20 a week');
});

test('math, already-escaped dollars and display math are left alone', () => {
  expect(escapeCurrency('the area is $x^2$ here')).toBe('the area is $x^2$ here');
  expect(escapeCurrency('costs \\$5')).toBe('costs \\$5');
  expect(escapeCurrency('$$5$$')).toBe('$$5$$');
});

test('inline code keeps its dollar signs', () => {
  expect(escapeCurrency('run `echo $5` for $5')).toBe('run `echo $5` for \\$5');
});
