/**
 * The band sheet: the frame every pop-up shares (DESIGN.md "Course card /
 * pop-up", "Event detail", "Map"). It owns the dark band (eyebrow, title,
 * close), the stat tiles, the actions row and the loading and error states;
 * each pop-up supplies its tiles, its body and its buttons.
 *
 *   <BandSheet kind="event" titleId="t" status="ready" band={<SheetBand … />} actions={…}>
 *     body
 *   </BandSheet>
 */
import React from 'react';
import { X } from '../../components/icons';
import { DragGrip } from '../../components/popup/PopupParts';
import PanelState from '../../components/panel/PanelState';
import './BandSheet.css';

/** Body class per pop-up: their stylesheets hang off it. */
const FAMILY = { course: 'cp', event: 'ep', place: 'ps' };

/**
 * One stat tile: `{key, label, value, unit, sub, tone, className, body}`.
 *   value   the number or word, in the display face
 *   unit    smaller text after the value ("min", "to 6:00 PM", "of 90")
 *   sub     a line under the value ("450 m")
 *   tone    colours the value (easier, typical, harder, a, df)
 *   body    a node drawn in place of value / unit (an icon, a two-line state)
 */
function Tile({ tile }) {
  return (
    <div className={`pop-number ${tile.className || ''}`.trim()}>
      <span className="pop-number-label">{tile.label}</span>
      {tile.body ?? (
        <span className={`pop-number-value ${tile.tone ? `is-${tile.tone}` : ''}`.trim()}>
          {tile.value}
          {tile.unit && <small>{` ${tile.unit}`}</small>}
        </span>
      )}
      {tile.sub && <span className="pop-number-sub">{tile.sub}</span>}
    </div>
  );
}

/**
 * The tiles row. `tiles` is a list of tiles (a missing one is simply left
 * out, and the rest share the band's width, design Q5) or a number of
 * skeleton tiles while loading. Renders nothing for an empty list.
 */
export function SheetTiles({ tiles }) {
  if (typeof tiles === 'number') {
    if (tiles < 1) return null;
    return (
      <div className="pop-numbers" style={{ '--pop-tiles': tiles }} aria-hidden="true">
        {Array.from({ length: tiles }, (_, n) => (
          <div key={n} className="pop-number"><span className="pop-skel pop-skel--label" /><span className="pop-skel pop-skel--number" /></div>
        ))}
      </div>
    );
  }
  const shown = (tiles || []).filter(Boolean);
  if (!shown.length) return null;
  return (
    <div className="pop-numbers" style={{ '--pop-tiles': shown.length }}>
      {shown.map((tile) => <Tile key={tile.key} tile={tile} />)}
    </div>
  );
}

export function CloseButton({ onClose, size = 20 }) {
  return (
    <button type="button" className="pop-icon-btn" aria-label="Close" title="Close" onClick={onClose}>
      <X size={size} aria-hidden="true" />
    </button>
  );
}

/**
 * The dark band.
 *
 *   title         the heading; null draws a skeleton (with `titleLabel` for screen readers)
 *   titleId       the heading's id (the dialog's aria-labelledby)
 *   titleLabel    what the heading says while loading or hidden ("Event")
 *   hideTitle     keep the heading for screen readers only (the error states)
 *   titleRef      a ref on the heading (the map card moves focus there)
 *   eyebrow       the line above the title (code and credits, kind, steps)
 *   lead          a block before the text (the event's date)
 *   drag, dragLabel   a `usePopupDrag()` result: the band becomes the drag source
 *   onClose, closeSize   the close button, top right; hidden without onClose
 *   tiles         see SheetTiles
 *   compact       the place card's tighter band (grip beside the title, smaller tiles)
 *   children      under the title (description, chips)
 */
export function SheetBand({
  title,
  titleId,
  titleLabel,
  hideTitle = false,
  titleRef,
  eyebrow,
  lead,
  drag,
  dragLabel,
  onClose,
  closeSize,
  tiles,
  compact = false,
  className = '',
  children,
}) {
  const grip = drag && dragLabel ? <DragGrip drag={drag} label={dragLabel} /> : null;
  const loading = title == null && !hideTitle;
  let heading;
  if (hideTitle) {
    heading = <h2 id={titleId} ref={titleRef} tabIndex={titleRef ? -1 : undefined} className="sr-only">{titleLabel}</h2>;
  } else {
    heading = (
      <h2 id={titleId} ref={titleRef} tabIndex={titleRef ? -1 : undefined} className="pop-title">
        {loading
          ? <><span className="sr-only">{titleLabel}</span><span className="pop-skel pop-skel--title" /></>
          : title}
      </h2>
    );
  }
  const classes = [
    'pop-band',
    compact && 'pop-band--compact',
    drag?.className,
    className,
  ].filter(Boolean).join(' ');

  return (
    <header ref={drag?.ref} className={classes}>
      {compact && !loading && !hideTitle && <span className="pop-grab" aria-hidden="true" />}
      <div className="pop-band-top">
        {!compact && grip}
        {lead}
        <div className="pop-band-text">
          {eyebrow && <div className="pop-eyebrow">{eyebrow}</div>}
          {compact && grip ? <div className="pop-title-row">{grip}{heading}</div> : heading}
          {children}
        </div>
        {onClose && (
          <div className="pop-actions pop-actions--close">
            <CloseButton onClose={onClose} size={closeSize} />
          </div>
        )}
      </div>
      {tiles != null && <SheetTiles tiles={tiles} />}
    </header>
  );
}

/** The actions row under the body. */
export function SheetActions({ children, className = '' }) {
  return <footer className={`pop-foot ${className}`.trim()}>{children}</footer>;
}

/**
 * The sheet itself.
 *
 *   kind      'course' | 'event' | 'place' (the body's class family) or none
 *   card      the scrolling card layout (the map's place card): band and body
 *             scroll, the actions stay put
 *   status    'ready' | 'loading' | 'error'
 *   error     {message, onRetry}: the error state's text and Retry (none for a 404)
 *   loadingLabel  what is loading, for screen readers ("Loading event")
 *   band, actions  a SheetBand and a SheetActions (or any nodes)
 *   children  the body when ready; while loading, the body's skeleton (optional)
 */
export default function BandSheet({
  kind,
  card = false,
  titleId,
  status = 'ready',
  error,
  loadingLabel = 'Loading',
  band,
  actions,
  className = '',
  children,
}) {
  const classes = [card ? 'pop-sheet' : 'pop', FAMILY[kind], className].filter(Boolean).join(' ');
  const Tag = card ? 'section' : 'article';
  let body = children;
  if (status === 'error') {
    body = (
      <div className="pop-body pop-state">
        <PanelState status="error" message={error?.message} onRetry={error?.onRetry} />
      </div>
    );
  } else if (status === 'loading') {
    body = children ? (
      <div className="pop-body pop-state">
        <PanelState status="loading" label={loadingLabel}>{children}</PanelState>
      </div>
    ) : <PanelState status="loading" label={loadingLabel} rows={0} />;
  }
  const shown = status === 'error' ? null : actions;

  return (
    <Tag className={classes} aria-labelledby={titleId} aria-busy={status === 'loading' ? 'true' : undefined}>
      {card ? (
        <>
          <div className="pop-scroll">{band}{body}</div>
          {shown}
        </>
      ) : (
        <>{band}{body}{shown}</>
      )}
    </Tag>
  );
}
