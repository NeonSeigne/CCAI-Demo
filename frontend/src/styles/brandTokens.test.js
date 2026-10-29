import fs from 'fs';
import path from 'path';

// D14 / D15: every -ink token reads at 4.5:1 on white and on its own tint.
const css = fs.readFileSync(path.join(__dirname, 'brand-tokens.css'), 'utf8');
const tokens = Object.fromEntries(
  [...css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map(([, name, hex]) => [name, hex]),
);

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

describe('brand tokens', () => {
  test.each(families)('%s has a graphic colour, an -ink and a -tint', (name) => {
    expect(tokens[name]).toBeDefined();
    expect(tokens[`${name}-ink`]).toBeDefined();
    expect(tokens[`${name}-tint`]).toBeDefined();
  });

  test.each(families)('%s-ink passes AA on white and on its tint', (name) => {
    expect(contrast(tokens[`${name}-ink`], '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tokens[`${name}-ink`], tokens[`${name}-tint`])).toBeGreaterThanOrEqual(4.5);
  });

  test('band text passes AA on the band', () => {
    expect(contrast(tokens['band-text'], tokens['band-bg'])).toBeGreaterThanOrEqual(4.5);
  });

  test.each(['easier', 'typical', 'harder', 'a', 'df'])('band %s text passes AA on the band', (name) => {
    expect(contrast(tokens[`band-${name}-text`], tokens['band-bg'])).toBeGreaterThanOrEqual(4.5);
  });

  test('gauge tokens exist', () => {
    expect(tokens['gauge-track']).toBeDefined();
    expect(tokens['gauge-band']).toBeDefined();
  });
});
