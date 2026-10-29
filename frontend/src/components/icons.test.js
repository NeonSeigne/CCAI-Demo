import fs from 'fs';
import path from 'path';
import React from 'react';
import { render } from '@testing-library/react';
import { Icon, LEGACY, StarRounded, X, iconFor, resolveIconName } from './icons';

const repo = path.join(__dirname, '..', '..', '..');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'index.html'), 'utf8');
const subset = html.match(/icon_names=([a-z0-9_,]+)/)[1].split(',');

const sourceFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return sourceFiles(full);
  return /\.js$/.test(entry.name) && !/\.test\.js$/.test(entry.name) ? [full] : [];
});

// Icon names the shipped configs use (personas, features, the logo).
const configIcons = ['undergrad_config.yaml', 'wisconsin_config.yaml']
  .flatMap((file) => [...fs.readFileSync(path.join(repo, file), 'utf8')
    .matchAll(/^\s*(?:icon|logo_icon):\s*"([^"]+)"/gm)].map((m) => m[1]));

describe('icon font subset', () => {
  test('is sorted, as Google Fonts requires', () => {
    expect([...subset].sort()).toEqual(subset);
  });

  test('covers every icon the code can render', () => {
    const literal = sourceFiles(path.join(__dirname, '..'))
      .flatMap((file) => [...fs.readFileSync(file, 'utf8').matchAll(/<Icon[^>]*\bname="([a-z0-9_]+)"/g)].map((m) => m[1]));
    const needed = new Set([...Object.values(LEGACY), resolveIconName(undefined), ...literal]);
    expect([...needed].filter((name) => !subset.includes(name))).toEqual([]);
  });

  test('covers every icon the shipped configs name', () => {
    expect(configIcons.length).toBeGreaterThan(0);
    expect(configIcons.filter((name) => !LEGACY[name])).toEqual([]);
  });
});

describe('Icon', () => {
  test('is decorative unless labelled', () => {
    const { container, getByRole } = render(
      <div>
        <Icon name="map" />
        <Icon name="close" label="Close" />
      </div>,
    );
    expect(container.querySelector('.ms').getAttribute('aria-hidden')).toBe('true');
    expect(getByRole('img', { name: 'Close' })).toHaveTextContent('close');
  });

  test('takes lucide size and MUI fontSize', () => {
    const { container } = render(<div><X size={18} /><X fontSize="small" /><X /></div>);
    const sizes = [...container.querySelectorAll('.ms')].map((el) => el.style.fontSize);
    expect(sizes).toEqual(['18px', '20px', '24px']);
  });

  test('fills when asked, or for icons that were solid', () => {
    const { container } = render(<div><Icon name="bookmark" filled /><StarRounded /><X /></div>);
    const filled = [...container.querySelectorAll('.ms')].map((el) => el.classList.contains('ms-fill'));
    expect(filled).toEqual([true, true, false]);
  });

  test('config names resolve to Material names with a fallback', () => {
    expect(resolveIconName('BookOpen')).toBe('menu_book');
    expect(resolveIconName('school')).toBe('school');
    expect(resolveIconName('NotAnIcon')).toBe('person');
    expect(iconFor('BookOpen')).toBe(iconFor('BookOpen'));
  });
});
