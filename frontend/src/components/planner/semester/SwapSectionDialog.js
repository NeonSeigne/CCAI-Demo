import React, { useMemo, useState } from 'react';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import AppDialog from '../../AppDialog';
import { usePageColumn } from '../../shell/PageColumnContext';
import { WEEKDAYS } from '../planFormat';
import { meetingClock as clockText } from '../../../modules/campus';
import { sectionMatches, sectionOptions, seatsOf } from './semesterData';

/**
 * Swap section: the course's sections by part (LEC / DIS / LAB), each with
 * its time, seats and Fits / Clash against the rest of the week. Fits and
 * Clash show only where the school publishes times (D23). Applies through
 * `pick_section`.
 */

const daysText = (meetings) => {
  const days = WEEKDAYS.filter((d) => meetings.some((m) => m.day === d.key)).map((d) => d.short).join(' ');
  const m = meetings[0];
  return m ? `${days} ${clockText(m.start)}–${clockText(m.end)}` : null;
};

export default function SwapSectionDialog({
  course, rows, blocks, chosen, loading = false, error = false, onRetry, onApply, onClose,
}) {
  const container = usePageColumn();
  const groups = useMemo(() => sectionOptions(rows || [], blocks || [], course), [rows, blocks, course]);
  const [chosenNow, setPicked] = useState({});

  // The current section, else the only one that fits, else the only one.
  const defaults = useMemo(() => {
    const out = {};
    groups.forEach((group) => {
      const current = group.options.find((o) => sectionMatches(o.row, chosen));
      const fit = group.options.filter((o) => o.fits);
      // An optional part (SEM, IND…) keeps only what the student already has.
      const choice = current || (group.required
        ? (fit.length === 1 ? fit[0] : null) || (group.options.length === 1 ? group.options[0] : null)
        : null);
      if (choice) out[group.part] = choice.id;
    });
    return out;
  }, [groups, chosen]);
  const picked = { ...defaults, ...chosenNow };

  const required = groups.filter((g) => g.required);
  const complete = groups.length > 0 && (required.length
    ? required.every((g) => picked[g.part])
    : groups.some((g) => picked[g.part]));
  const titleId = 'sv-swap-title';

  return (
    <AppDialog
      open
      onClose={onClose}
      container={container || undefined}
      maxWidth="xs"
      fullWidth
      aria-labelledby={titleId}
      slotProps={{ paper: { className: 'sv-swap' } }}
    >
      <DialogTitle id={titleId}>Swap section · {course}</DialogTitle>
      <DialogContent>
        {error && (
          <p className="sv-error" role="alert">
            Couldn&apos;t load
            <span aria-hidden="true"> · </span>
            <button type="button" className="sv-link" onClick={onRetry}>Retry</button>
          </p>
        )}
        {!error && loading && <div className="sv-skel sv-skel-row" aria-busy="true" aria-label="Loading sections" />}
        {!error && !loading && groups.length === 0 && <p className="sv-muted">No sections listed.</p>}
        {groups.map((group) => (
          <fieldset key={group.part} className="sv-swap-group">
            {groups.length > 1 && <legend>{group.part}</legend>}
            {group.options.map((option) => {
              const seats = seatsOf(option.row);
              const time = daysText(option.meetings);
              return (
                <label
                  key={option.id}
                  className={`sv-swap-row ${option.fits === false ? 'is-clash' : ''}`.trim()}
                >
                  <input
                    type="radio"
                    name={`sv-swap-${group.part}`}
                    value={option.id}
                    checked={picked[group.part] === option.id}
                    onChange={() => setPicked((current) => ({ ...current, [group.part]: option.id }))}
                  />
                  <span className="sv-swap-name">
                    {group.part}
                    {' '}
                    <b>{option.row.section}</b>
                  </span>
                  {time && <span className="sv-swap-time">{time}</span>}
                  {seats && <span className="sv-swap-seats">{seats.open} of {seats.capacity} left</span>}
                  {option.fits === true && <span className="sv-fit is-fits">Fits</span>}
                  {option.fits === false && (
                    <span className="sv-fit is-clash">Clash · {option.clash.join(', ')}</span>
                  )}
                </label>
              );
            })}
          </fieldset>
        ))}
      </DialogContent>
      <DialogActions>
        <button type="button" className="sv-btn" onClick={onClose}>Cancel</button>
        <button
          type="button"
          className="sv-btn is-primary"
          disabled={!complete}
          onClick={() => onApply(groups.map((g) => picked[g.part]).filter(Boolean))}
        >
          Apply
        </button>
      </DialogActions>
    </AppDialog>
  );
}
