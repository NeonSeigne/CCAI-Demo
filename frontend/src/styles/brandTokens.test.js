import fs from 'fs';
import path from 'path';
import { NEUTRAL_SCHOOL, SHARED, resolveRoles } from '../theme/schoolTheme';

// D14 / D15: every -ink token reads at 4.5:1 on the page and on its own tint,
// in light and in dark. School colours are checked in the backend
// (test_school_theme.py) because they live in each school.yaml.
const css = fs.readFileSync(path.join(__dirname, 'brand-tokens.css'), 'utf8');
const block = (selector) => {
  const start = css.indexOf(`${selector} {`);
  return css.slice(start, css.indexOf('\n}', start));
};
const parse = (text) => Object.fromEntries(
  [...text.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map(([, name, hex]) => [name, hex]),
);
const light = parse(block(':root'));
const dark = { ...light, ...parse(block('html[data-theme="dark"]')) };
const page = { light: SHARED.light.surface, dark: SHARED.dark.surface };

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const families = [
  'difficulty-easier', 'difficulty-typical', 'difficulty-harder',
  'course-1', 'course-2', 'course-3', 'course-4', 'course-5', 'course-6',
];
const domains = ['domain-academics', 'domain-student-life', 'domain-campus'];

describe.each([['light', light], ['dark', dark]])('%s tokens', (mode, tokens) => {
  test.each(families)('%s has a graphic colour, an -ink and a -tint', (name) => {
    expect(tokens[name]).toBeDefined();
    expect(tokens[`${name}-ink`]).toBeDefined();
    expect(tokens[`${name}-tint`]).toBeDefined();
  });

  test.each([...families, ...domains])('%s-ink passes AA on the page and on its tint', (name) => {
    expect(contrast(tokens[`${name}-ink`], page[mode])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tokens[`${name}-ink`], tokens[`${name}-tint`])).toBeGreaterThanOrEqual(4.5);
  });
});

describe('shared roles', () => {
  test.each(['light', 'dark'])('%s text roles read at AA on surface and raised', (mode) => {
    const roles = resolveRoles(undefined, mode);
    ['ink', 'muted', 'error', 'good'].forEach((fg) => {
      expect(contrast(roles[fg], roles.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(roles[fg], roles.raised)).toBeGreaterThanOrEqual(4.5);
    });
  });

  test.each(['light', 'dark'])('%s neutral school pairs read at AA', (mode) => {
    const r = NEUTRAL_SCHOOL[mode];
    expect(contrast(r.on_signal, r.signal)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(r.tint_ink, r.tint)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(r.mark_ink, r.mark_bg)).toBeGreaterThanOrEqual(4.5);
  });

  test.each(['easier', 'typical', 'harder', 'a', 'df'])('band %s text passes AA on the darkest band', (name) => {
    expect(contrast(light[`band-${name}-text`], '#14171F')).toBeGreaterThanOrEqual(4.5);
  });
});

// Colours come from tokens. These files keep literal colours on purpose.
const RAW_COLOUR_ALLOWED = {
  'theme/schoolTheme.js': 'the shared roles themselves',
  'styles/brand-tokens.css': 'the data palettes',
  'components/Login.js': "Google's sign-in logo",
  'components/Signup.js': "Google's sign-in logo",
  'contexts/AppConfigContext.js': 'persona colours; callers append alpha suffixes',
  'data/advisors.js': 'persona colours; callers append alpha suffixes',
  'components/visuals/CourseAnswerCard.js': 'grade ramp; lane C rebuilds this card',
  'components/course/PrereqWeb.js': 'cytoscape fallbacks; lane C replaces cytoscape (R11)',
};

const sourceFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return sourceFiles(full);
  return /\.(js|css)$/.test(entry.name) && !/\.test\.js$/.test(entry.name) ? [full] : [];
});

test('no raw colours outside the token files', () => {
  const root = path.join(__dirname, '..');
  const offenders = sourceFiles(root)
    .map((file) => path.relative(root, file))
    .filter((rel) => !RAW_COLOUR_ALLOWED[rel])
    .flatMap((rel) => fs.readFileSync(path.join(root, rel), 'utf8').split('\n')
      .map((line, i) => [rel, i + 1, line])
      .filter(([, , line]) => /(['"\s:(,])#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b|(['"\s:(,])#[0-9a-fA-F]{3}\b/.test(line)
        && !/^\s*(\/\/|\/\*|\*)/.test(line)))
    .map(([rel, n, line]) => `${rel}:${n}: ${line.trim()}`);
  expect(offenders).toEqual([]);
});
