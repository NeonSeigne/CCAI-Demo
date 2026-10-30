import React from 'react';
import { ThemeToggle } from './CampusRail';
import { useSchool } from '../modules/campus';
import '../styles/CampusRail.css';
import '../styles/BootScreen.css';

const ROWS = (count, small) => Array.from({ length: count }, (_, index) => (
  <div className="bt-row" key={index}>
    <span className="bt-sk bt-a" />
    <span>
      <span className="bt-sk bt-b" />
      <span className="bt-sk bt-b2" />
    </span>
    {!small && <span className="bt-sk bt-c" />}
  </div>
));

/**
 * A page's own layout in raised while it loads (DESIGN.md States, boot.html).
 * `shape` "home" is the Ask home (title, composer, panels); "page" is a
 * title and one panel of rows, for the pages that load on their own.
 * `label` is read to screen readers only.
 */
export function PageSkeleton({ label, shape = 'home' }) {
  if (shape === 'page') {
    return (
      <div className="bt-page" role="status" aria-live="polite">
        <span className="sr-only">{label}</span>
        <div className="bt-home is-page" aria-hidden="true">
          <span className="bt-sk bt-l2 bt-title" />
          <div className="bt-panel">
            <span className="bt-sk bt-h" />
            {ROWS(6)}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="bt-page" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="bt-home" aria-hidden="true">
        <span className="bt-sk bt-l1" />
        <span className="bt-sk bt-l2" />
        <span className="bt-comp"><span className="bt-sk" /></span>
        <div className="bt-bento">
          <div className="bt-panel">
            <span className="bt-sk bt-h" />
            {ROWS(4)}
          </div>
          <div className="bt-side">
            <div className="bt-panel is-small">
              <span className="bt-sk bt-h" />
              {ROWS(2, true)}
            </div>
            <div className="bt-panel is-small">
              <span className="bt-sk bt-h" />
              {ROWS(3, true)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The boot screen (boot.html): the school frame (rail, or the phone header
 * and tab bar) around the page skeleton. "Checking session…" is status text
 * for screen readers.
 */
export default function BootScreen({ label = 'Checking session…' }) {
  const { shortName, mark } = useSchool();
  return (
    <div className="bt-frame" aria-busy="true">
      <div className="bt-rail campus-rail">
        <div className="campus-brand" aria-hidden="true">
          <span className="campus-brand-mark">{mark}</span>
          <span className="campus-brand-text">
            <span className="campus-brand-name">Campus Companion</span>
            <span className="campus-school-name">{shortName}</span>
          </span>
        </div>
        <div className="bt-nav" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((index) => <i key={index} />)}
        </div>
        <ThemeToggle className="campus-rail-toggle bt-toggle" />
      </div>
      <header className="campus-phone-header bt-phone-header">
        <span className="campus-brand-mark" aria-hidden="true">{mark}</span>
        <span className="campus-phone-name" aria-hidden="true">Campus Companion</span>
        <ThemeToggle className="campus-phone-toggle" />
      </header>
      <main className="bt-main">
        <PageSkeleton label={label} />
      </main>
      <div className="bt-tabbar" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((index) => <i key={index} />)}
      </div>
    </div>
  );
}
