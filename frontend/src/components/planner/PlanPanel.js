import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Plus, X } from 'lucide-react';
import { usePlanner } from '../../contexts/PlannerContext';
import { useAppConfig } from '../../contexts/AppConfigContext';
import { useToast } from '../Toast';
import { plannerError } from '../../api/planner';
import {
  STATUS_WORDS,
  WEEKDAYS,
  asOfText,
  clashIds,
  clockText,
  creditSpan,
  creditTotal,
  difficultyTag,
  minutes,
  reasonText,
  ruleCount,
  ruleHave,
  schoolShort,
  statusWord,
} from './planFormat';
import { previewOf } from './proposalDiff';
import '../../styles/PlanCards.css';
import '../../styles/PlanPanel.css';

/**
 * The student's plan for the next term (design review 1A–19A): header with
 * the "Preview · not applied" label and a named Undo, provenance, Courses,
 * the summary line, Requirements, Weekly schedule and Later.
 *
 * The panel always shows the saved plan. While a proposal is pending, each
 * changed value reads "before → after" in academics ink (1A) and proposed
 * rows say "Proposed removal" / "Proposed addition" in text.
 *
 * Props:
 *   onClose()            close button (absent: no close button)
 *   onPrefill(text)      put text in the chat composer (first-visit chips, Suggest courses)
 *   courseId / onOpenCourse(id) / onBack()   course details shown in place, "Back to plan"
 *   onOpenCoursePage(id) the full course page
 *   variant              'panel' | 'drawer' | 'sheet' (styling only)
 */

const DAY_START = 8 * 60;
const DAY_END = 20 * 60;
const HOURS = [8, 10, 12, 14, 16, 18];

function Arrow({ before, after }) {
  if (before === after || before == null) return <span className="pp-after">{after}</span>;
  return (
    <span className="pp-change">
      <span className="pp-before">{before}</span>
      <span aria-hidden="true"> → </span>
      <span className="sr-only"> changes to </span>
      <span className="pp-after">{after}</span>
    </span>
  );
}

function Tag({ harder }) {
  const tag = difficultyTag(harder);
  return <span className={`pp-tag is-${tag.key}`}>{tag.label}</span>;
}

function SectionHeading({ id, children }) {
  return <h3 className="pp-section-title" id={id}>{children}</h3>;
}

// ---- Loading, error, notices ----------------------------------------------

function Skeleton() {
  return (
    <div className="pp-skeleton" aria-busy="true" aria-label="Loading your plan">
      <div className="pp-skel pp-skel-title" />
      <div className="pp-skel pp-skel-line" />
      {[0, 1, 2, 3].map((i) => <div key={i} className="pp-skel pp-skel-row" />)}
    </div>
  );
}

function LoadError({ onRetry }) {
  return (
    <div className="pp-error">
      <p>Couldn't load your plan</p>
      <button type="button" className="pp-btn" onClick={onRetry}>Retry</button>
    </div>
  );
}

function ConflictNotice({ onDismiss }) {
  return (
    <div className="pp-notice" role="status">
      <span>Updated from another window</span>
      <button type="button" className="pp-link" onClick={onDismiss}>Dismiss</button>
    </div>
  );
}

// ---- First visit and checklist (8A) ----------------------------------------

function FirstVisit({ term, programs, onPrefill, onTickOff }) {
  return (
    <div className="pp-first">
      <h2 className="pp-title">Plan your {term}</h2>
      <p className="pp-first-line">Tell me your major and what you've taken, in your own words.</p>
      {programs.length > 0 && (
        <div className="pp-chips" aria-label="Programs">
          {programs.map((program) => (
            <button
              key={program.id}
              type="button"
              className="pp-chip"
              onClick={() => onPrefill?.(`I'm doing the ${program.name}. So far I've taken `)}
            >
              {program.name}
            </button>
          ))}
        </div>
      )}
      <button type="button" className="pp-link" onClick={onTickOff}>Tick off courses</button>
    </div>
  );
}

/** Courses the checklist can offer: program rule lists when the API sends them, else what the checker named. */
function checklistCourses(programIds, programs, report, completed) {
  const ids = [];
  programs
    .filter((p) => programIds.includes(p.id))
    .forEach((p) => (p.rules || []).forEach((rule) => (rule.courses || []).forEach((id) => ids.push(id))));
  (report?.rules || []).forEach((rule) => {
    (rule.completed_courses || []).forEach((id) => ids.push(id));
    (rule.planned_courses || []).forEach((id) => ids.push(id));
  });
  completed.forEach((c) => ids.push(c.id));
  return [...new Set(ids.filter(Boolean))];
}

function Checklist({ planner, onDone }) {
  const { view, programs } = planner;
  const profile = view?.plan?.profile || {};
  const completed = profile.completed || [];
  const [programId, setProgramId] = useState((profile.program_ids || [])[0] || '');
  const [ticked, setTicked] = useState(() => new Set(completed.map((c) => c.id)));
  const [extra, setExtra] = useState([]);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [notes, setNotes] = useState([]);

  const programIds = programId ? [programId] : [];
  const courses = [...new Set([...checklistCourses(programIds, programs, view?.report, completed), ...extra])];

  const toggle = (id) => setTicked((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const addTyped = (event) => {
    event.preventDefault();
    const id = draft.trim().toUpperCase().replace(/\s+/g, ' ');
    if (!id) return;
    setExtra((current) => (current.includes(id) ? current : [...current, id]));
    setTicked((current) => new Set(current).add(id));
    setDraft('');
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const keep = new Map(completed.map((c) => [c.id, c]));
    const op = {
      op: 'set_profile',
      completed: [...ticked].map((id) => keep.get(id) || { id, grade: null, term: null }),
    };
    if (programId && !(profile.program_ids || []).includes(programId)) op.program_ids = [programId];
    try {
      const data = await planner.edit([op]);
      const found = data?.notes || [];
      setNotes(found);
      if (!found.length) onDone();
    } catch (err) {
      const info = plannerError(err);
      setError(info.message || "Couldn't save your courses. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pp-checklist">
      <button type="button" className="pp-back" onClick={onDone}>
        <ArrowLeft size={16} aria-hidden="true" /> Back to plan
      </button>
      <h2 className="pp-title">Courses you've taken</h2>
      {!programId ? (
        <fieldset className="pp-fieldset">
          <legend>Pick your program first</legend>
          {programs.length === 0 && <p className="pp-muted">No programs are set up for this school yet.</p>}
          {programs.map((program) => (
            <label key={program.id} className="pp-check">
              <input type="radio" name="pp-program" value={program.id} onChange={() => setProgramId(program.id)} />
              <span>{program.name}</span>
            </label>
          ))}
        </fieldset>
      ) : (
        <fieldset className="pp-fieldset">
          <legend>Tick the ones you've finished</legend>
          {courses.length === 0 && (
            <p className="pp-muted">This program's course list isn't here yet. Add courses by code below.</p>
          )}
          {courses.map((id) => {
            const unverified = notes.some((note) => note.includes(id));
            return (
              <label key={id} className="pp-check">
                <input type="checkbox" checked={ticked.has(id)} onChange={() => toggle(id)} />
                <span>{id}</span>
                {unverified && <span className="pp-muted"> · couldn't verify</span>}
              </label>
            );
          })}
        </fieldset>
      )}
      {programId && (
        <form className="pp-add" onSubmit={addTyped}>
          <label className="sr-only" htmlFor="pp-checklist-add">Course code</label>
          <input
            id="pp-checklist-add"
            className="pp-input"
            value={draft}
            placeholder="Add a course code, e.g. ECON 2010"
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" className="pp-btn">Add</button>
        </form>
      )}
      {error && <p className="pp-inline-error" role="alert">{error}</p>}
      {notes.length > 0 && (
        <p className="pp-muted">Saved. Some courses couldn't be verified and were kept as you entered them.</p>
      )}
      {programId && (
        <div className="pp-actions">
          <button type="button" className="pp-btn is-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="pp-btn" onClick={onDone}>Cancel</button>
        </div>
      )}
    </div>
  );
}

// ---- Course details shown in place ("Back to plan", 5A) ---------------------

function CourseDetail({ id, report, onBack, onOpenCoursePage }) {
  const row = (report?.courses || []).find((c) => c.id === id);
  const credits = creditSpan(row?.credits);
  return (
    <div className="pp-detail">
      <button type="button" className="pp-back" onClick={onBack}>
        <ArrowLeft size={16} aria-hidden="true" /> Back to plan
      </button>
      <h2 className="pp-title">{id}</h2>
      {row?.title && <p className="pp-detail-title">{row.title}</p>}
      {row ? (
        <dl className="pp-facts">
          <dt>Credits</dt><dd>{credits ? `${credits} cr` : 'Unknown'}</dd>
          <dt>Grades</dt><dd><Tag harder={row.harder} /></dd>
          <dt>Prerequisites</dt>
          <dd className={row.prereqs?.status === 'short' ? 'is-short' : undefined}>
            {statusWord(row.prereqs?.status)}{row.prereqs?.reason ? ` · ${row.prereqs.reason}` : ''}
          </dd>
          <dt>Offered {row.term || ''}</dt>
          <dd>{{ yes: 'Yes', no: 'No', unknown: 'Unknown' }[row.offered] || 'Unknown'}</dd>
          {row.fills?.length > 0 && (<><dt>Counts toward</dt><dd>{row.fills.join(', ')}</dd></>)}
          {row.gen_ed?.length > 0 && (<><dt>Gen-ed</dt><dd>{row.gen_ed.join(', ')}</dd></>)}
        </dl>
      ) : (
        <p className="pp-muted">Not in this term's plan.</p>
      )}
      {onOpenCoursePage && (
        <button type="button" className="pp-link" onClick={() => onOpenCoursePage(id)}>Open course page</button>
      )}
    </div>
  );
}

// ---- Courses ----------------------------------------------------------------

function CourseRow({ course, preview, flash, solid, onOpen, onRemove }) {
  const moved = preview?.moved.get(course.id);
  const removed = preview && (preview.removed.has(course.id) || (moved && moved.to !== course.term));
  const credits = creditSpan(course.credits);
  return (
    <li className={`pp-course ${removed ? 'is-removal' : ''} ${flash ? 'pp-flash' : ''} ${solid ? 'pp-solidify' : ''}`.trim()}>
      <button type="button" className="pp-course-main" onClick={() => onOpen?.(course.id)}>
        <span className="pp-course-name">
          <span className="pp-course-code">{course.id}</span> {course.title}
        </span>
        <span className="pp-course-meta">
          {credits ? ` · ${credits} cr` : ' · credits unknown'}
          {removed && <span className="pp-proposed-label"> · Proposed removal{moved ? ` · moves to ${moved.to}` : ''}</span>}
          {course.prereqs?.status === 'short' && <span className="pp-short"> · Prerequisites short</span>}
        </span>
      </button>
      <Tag harder={course.harder} />
      {onRemove && !removed && (
        <button type="button" className="pp-icon-btn" aria-label={`Remove ${course.id}`} onClick={() => onRemove(course.id)}>
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </li>
  );
}

/**
 * Accept / Discard for a pending proposal, in the panel too: the chat card may
 * be in another chat or gone after a reload, and a proposal from "Suggest
 * courses" has no card at all. Same planner calls as the card, so they agree.
 */
function PendingReview({ proposal, planner }) {
  const state = planner.proposalState?.(proposal.id);
  const busy = state?.status === 'applying' || state?.status === 'discarding';
  return (
    <div className="pp-review" role="group" aria-label="Pending change">
      <span className="pp-review-heading">{proposal.diff?.heading || 'Proposed change'}</span>
      <span className="pp-review-actions">
        <button type="button" className="pp-btn is-primary" disabled={busy} onClick={() => planner.accept(proposal)}>
          {state?.status === 'applying' ? 'Applying…' : 'Accept'}
        </button>
        <button type="button" className="pp-btn" disabled={busy} onClick={() => planner.discard(proposal)}>
          Discard
        </button>
      </span>
      {state?.error && <span className="pp-short">{state.error}</span>}
      {state?.status === 'refused' && <span className="pp-short">{state.reason}</span>}
    </div>
  );
}

function AddSlot({ term, onPrefill, onAdd }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    const id = draft.trim();
    if (!id) return;
    setBusy(true);
    setError(null);
    const message = await onAdd(id);
    setBusy(false);
    if (message) setError(message);
    else { setDraft(''); setOpen(false); }
  };

  if (open) {
    return (
      <li className="pp-slot">
        <form className="pp-add" onSubmit={submit}>
          <label className="sr-only" htmlFor="pp-add-course">Course code</label>
          <input
            id="pp-add-course"
            className="pp-input"
            value={draft}
            autoFocus
            placeholder="Course code, e.g. ECON 3300"
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" className="pp-btn" disabled={busy}>{busy ? 'Adding…' : 'Add'}</button>
          <button type="button" className="pp-btn" onClick={() => { setOpen(false); setError(null); }}>Cancel</button>
        </form>
        {error && <p className="pp-inline-error" role="alert">{error}</p>}
      </li>
    );
  }
  return (
    <li className="pp-slot">
      <button type="button" className="pp-link" onClick={() => setOpen(true)}>
        <Plus size={14} aria-hidden="true" /> Add a course
      </button>
      <span className="pp-dot" aria-hidden="true">·</span>
      <button type="button" className="pp-link" onClick={() => onPrefill?.(`Suggest courses for my ${term}`)}>
        Suggest courses
      </button>
    </li>
  );
}

// ---- Summary line -------------------------------------------------------------

function Summary({ report, preview, school }) {
  const credits = report.credits || {};
  const limits = credits.limits;
  const total = creditTotal(credits) ?? '?';
  const after = preview?.credits ? creditSpan(preview.credits.after) : null;
  let limitText = null;
  let limitShort = false;
  if (credits.status === 'met' && limits) limitText = `within ${creditSpan([limits.min, limits.max])}`;
  else if (credits.status === 'short') { limitText = limits ? `below the ${limits.min} minimum` : 'short'; limitShort = true; }
  else if (credits.status === 'over') { limitText = limits ? `over the ${limits.max} maximum` : 'over the limit'; limitShort = true; }
  else if (credits.status === 'unknown') limitText = `limits unknown${credits.reason ? ` · ${reasonText(credits.reason, school)}` : ''}`;

  const difficulty = report.difficulty || {};
  const clashes = report.clashes || {};
  const clashWord = clashes.status === 'found' ? 'found' : clashes.status === 'none' ? 'none' : 'unknown';

  return (
    <div className="pp-summary">
      <span>
        <Arrow before={preview?.credits ? total : null} after={preview?.credits ? (after ?? '?') : total} /> credits
        {limitText && <span className={limitShort ? 'pp-short' : 'pp-muted'}> · {limitText}</span>}
      </span>
      <span>
        Difficulty estimate:{' '}
        {preview?.difficulty && preview.difficulty.before !== preview.difficulty.after ? (
          <Arrow before={preview.difficulty.before || 'unknown'} after={preview.difficulty.after || 'unknown'} />
        ) : (difficulty.label || 'unknown')}
        <span className="pp-muted"> · {difficulty.label || preview?.difficulty?.after ? 'from past grades' : 'no grade data'}</span>
      </span>
      <span className={clashes.status === 'found' ? 'pp-short' : undefined}>
        Clashes:{' '}
        {preview?.clashes && preview.clashes.before !== preview.clashes.after ? (
          <Arrow before={preview.clashes.before || 'unknown'} after={preview.clashes.after || 'unknown'} />
        ) : clashWord}
        {clashWord === 'unknown' && clashes.reason && (
          <span className="pp-muted"> · {reasonText(clashes.reason, school)}</span>
        )}
        {clashWord === 'found' && (clashes.pairs || []).length > 0 && (
          <span> · {(clashes.pairs || []).map((p) => p.join(' / ')).join(', ')}</span>
        )}
      </span>
    </div>
  );
}

// ---- Requirements (9A) ------------------------------------------------------------

function RuleRow({ rule, change, flash, school }) {
  const status = rule.status || 'unknown';
  const glyph = STATUS_WORDS[status] || STATUS_WORDS.unknown;
  const needed = rule.needed || 0;
  const pct = (n) => (needed > 0 ? Math.max(0, Math.min(100, (n / needed) * 100)) : 0);
  const completedPct = pct(rule.completed || 0);
  const plannedPct = Math.min(100 - completedPct, pct(rule.planned || 0));

  let count = ruleCount(rule, rule.unit);
  if (change) {
    const unitText = rule.unit === 'credits' ? ' credits' : '';
    count = (
      <>
        <Arrow before={`${ruleHave(change.before)}`} after={`${ruleHave(change.after)}`} /> of {change.after?.needed ?? needed}{unitText}
      </>
    );
  }
  const statusText = change && change.before?.status !== change.after?.status
    ? <Arrow before={statusWord(change.before?.status)} after={statusWord(change.after?.status)} />
    : glyph.word;

  return (
    <li className={`pp-rule is-${status} ${flash ? 'pp-flash' : ''}`.trim()}>
      <div className="pp-rule-line">
        <span className="pp-rule-title">
          <span className="pp-glyph" aria-hidden="true">{glyph.glyph}</span> {rule.title}
        </span>
        <span className={`pp-rule-status ${status === 'short' ? 'pp-short' : ''}`.trim()}>
          {statusText}
          {status !== 'unknown' && count != null && <> · {count}</>}
          {status === 'unknown' && rule.reason && <span className="pp-muted"> · {reasonText(rule.reason, school)}</span>}
        </span>
      </div>
      {status !== 'unknown' && needed > 0 && (
        <div className="pp-bar" aria-hidden="true">
          <span className="pp-bar-done" style={{ width: `${completedPct}%` }} />
          <span className="pp-bar-planned" style={{ width: `${plannedPct}%` }} />
        </div>
      )}
    </li>
  );
}

// ---- Weekly schedule (18A) ----------------------------------------------------------

function blockClashes(block, blocks, pairs) {
  return blocks.some((other) => other !== block
    && other.course !== block.course
    && other.day === block.day
    && pairs.some((p) => p.includes(block.course) && p.includes(other.course))
    && minutes(block.start) < minutes(other.end)
    && minutes(other.start) < minutes(block.end));
}

function WeekSchedule({ report, preview, proposal, school }) {
  const [asList, setAsList] = useState(false);
  const schedule = report.schedule || {};
  if (schedule.published === false) {
    return <p className="pp-muted pp-schedule-note">{reasonText(schedule.reason, school) || `${school} doesn't publish class times`}</p>;
  }
  const pairs = report.clashes?.pairs || [];
  const proposedBlocks = (proposal?.diff?.schedule?.blocks || [])
    .filter((b) => preview?.added.has(b.course))
    .map((b) => ({ ...b, proposed: 'addition' }));
  const blocks = [
    ...(schedule.blocks || []).map((b) => ({
      ...b,
      proposed: preview && (preview.removed.has(b.course) || preview.moved.has(b.course)) ? 'removal' : null,
    })),
    ...proposedBlocks,
  ].filter((b) => WEEKDAYS.some((d) => d.key === b.day));

  if (!blocks.length) {
    const reason = report.clashes?.status === 'unknown' ? reasonText(report.clashes.reason, school) : null;
    return <p className="pp-muted pp-schedule-note">{reason ? `No week to show yet · ${reason}` : 'No class times to show yet.'}</p>;
  }
  const clashSet = clashIds(report.clashes);
  const describe = (b) => {
    const day = WEEKDAYS.find((d) => d.key === b.day)?.short;
    const extra = [
      b.kind && b.kind !== 'lecture' ? b.kind : null,
      b.proposed === 'addition' ? 'Proposed addition' : null,
      b.proposed === 'removal' ? 'Proposed removal' : null,
      clashSet.has(b.course) && blockClashes(b, blocks, pairs) ? 'Clash' : null,
    ].filter(Boolean);
    return `${day} ${clockText(b.start)}–${clockText(b.end)} ${b.course}${extra.length ? ` (${extra.join(', ')})` : ''}`;
  };
  const sorted = [...blocks].sort((a, b) => (
    WEEKDAYS.findIndex((d) => d.key === a.day) - WEEKDAYS.findIndex((d) => d.key === b.day)
    || minutes(a.start) - minutes(b.start)
  ));

  return (
    <div className="pp-week-wrap">
      <button type="button" className="pp-link pp-week-toggle" aria-pressed={asList} onClick={() => setAsList(!asList)}>
        {asList ? 'Show as grid' : 'Show as list'}
      </button>
      {asList ? (
        <ul className="pp-week-list">
          {sorted.map((b, i) => <li key={`${b.course}-${b.section}-${b.day}-${i}`}>{describe(b)}</li>)}
        </ul>
      ) : (
        <>
          <ul className="sr-only">
            {sorted.map((b, i) => <li key={`${b.course}-${b.section}-${b.day}-${i}`}>{describe(b)}</li>)}
          </ul>
          <div className="pp-week" aria-hidden="true">
            <div className="pp-week-hours">
              <span className="pp-week-dayhead" />
              <div className="pp-week-col-body">
                {HOURS.map((h) => (
                  <span key={h} className="pp-week-hour" style={{ top: `${((h * 60 - DAY_START) / (DAY_END - DAY_START)) * 100}%` }}>
                    {((h + 11) % 12) + 1}
                  </span>
                ))}
              </div>
            </div>
            {WEEKDAYS.map((day) => (
              <div key={day.key} className="pp-week-col">
                <span className="pp-week-dayhead">{day.short}</span>
                <div className="pp-week-col-body">
                  {blocks.filter((b) => b.day === day.key).map((b, i) => {
                    const start = Math.max(minutes(b.start), DAY_START);
                    const end = Math.min(minutes(b.end), DAY_END);
                    if (end <= start) return null;
                    const clash = clashSet.has(b.course) && blockClashes(b, blocks, pairs);
                    const cls = [
                      'pp-block',
                      b.kind && b.kind !== 'lecture' ? 'is-secondary' : '',
                      b.proposed ? `is-proposed is-${b.proposed}` : '',
                      clash ? 'is-clash' : '',
                    ].filter(Boolean).join(' ');
                    return (
                      <span
                        key={`${b.course}-${b.section}-${i}`}
                        className={cls}
                        style={{
                          top: `${((start - DAY_START) / (DAY_END - DAY_START)) * 100}%`,
                          height: `${((end - start) / (DAY_END - DAY_START)) * 100}%`,
                        }}
                      >
                        {b.course}{clash ? ' · Clash' : ''}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---- The panel ----------------------------------------------------------------

export default function PlanPanel({
  onClose,
  onPrefill,
  courseId = null,
  onOpenCourse,
  onBack,
  onOpenCoursePage,
  variant = 'panel',
  closeRef,
}) {
  const planner = usePlanner();
  const { config } = useAppConfig() || {};
  const toast = useToast();
  const [mode, setMode] = useState('plan');
  const [undoing, setUndoing] = useState(false);
  const regionRef = useRef(null);
  const school = schoolShort(config);

  useEffect(() => { planner?.ensureLoaded(); }, [planner]);

  const view = planner?.view;
  const proposal = view?.proposal && (view.proposal.status || 'pending') === 'pending' ? view.proposal : null;
  const preview = useMemo(() => previewOf(proposal), [proposal]);

  if (!planner) return null;
  const { status, programs, notice } = planner;

  const doUndo = async () => {
    if (!view?.undo_label || undoing) return;
    setUndoing(true);
    try {
      await planner.undo();
    } catch (error) {
      const info = plannerError(error);
      toast.show({ message: info.kind === 'refused' && info.reason ? info.reason : "Couldn't undo", tone: 'error' });
    } finally {
      setUndoing(false);
    }
  };

  const onKeyDown = (event) => {
    const tag = event.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      doUndo();
    }
  };

  const runEdit = async (ops) => {
    try {
      const data = await planner.edit(ops);
      if (data?.undo_label) {
        toast.show({
          message: data.undo_label.replace(/^Undo:\s*/, '').replace(/^./, (c) => c.toUpperCase()),
          duration: 6000,
          actions: [{ label: 'Undo', onClick: () => doUndo() }],
        });
      }
      return null;
    } catch (error) {
      const info = plannerError(error);
      if (info.kind === 'edit') return info.message || "Couldn't make that change";
      if (info.kind === 'conflict') return 'Your plan changed in another window. Check it and try again.';
      return "Couldn't reach the planner. Try again.";
    }
  };

  const removeCourse = async (id) => {
    const message = await runEdit([{ op: 'remove', course: id }]);
    if (message) toast.show({ message, tone: 'error' });
  };

  const report = view?.report;
  const plan = view?.plan;
  const term = report?.term || plan?.term || 'next term';
  const profile = plan?.profile || {};
  const programNames = (profile.program_ids || []).map((id) => programs.find((p) => p.id === id)?.name || id);
  const firstVisit = plan && !(plan.courses || []).length && !(profile.program_ids || []).length
    && !(profile.completed || []).length;
  const asOf = asOfText(report?.data_as_of);
  const flashKey = proposal?.id || '';
  const solid = new Set(planner.lastApplied?.added || []);

  let body;
  if (status === 'loading' || (status === 'idle' && !view)) body = <Skeleton />;
  else if (status === 'error' && !view) body = <LoadError onRetry={() => planner.load().catch(() => {})} />;
  else if (!view) body = <Skeleton />;
  else if (courseId) {
    body = <CourseDetail id={courseId} report={report} onBack={onBack} onOpenCoursePage={onOpenCoursePage} />;
  } else if (mode === 'checklist') {
    body = <Checklist planner={planner} onDone={() => setMode('plan')} />;
  } else if (firstVisit) {
    body = <FirstVisit term={term} programs={programs} onPrefill={onPrefill} onTickOff={() => setMode('checklist')} />;
  } else {
    const courses = (report?.courses || []).filter((c) => !c.term || c.term === term);
    const added = preview ? [...preview.added].filter((id) => !courses.some((c) => c.id === id)) : [];
    const movedIn = preview ? [...preview.moved.values()].filter((m) => m.to === term) : [];
    const rules = report?.rules || [];
    const later = report?.later || [];
    const movingOut = preview ? [...preview.moved.values()].filter((m) => m.to !== term) : [];

    body = (
      <>
        <header className="pp-header">
          <div className="pp-header-top">
            <h2 className="pp-title">{term}</h2>
            {proposal && <span className="pp-preview-label">Preview · not applied</span>}
          </div>
          {proposal && <PendingReview proposal={proposal} planner={planner} />}
          {view.undo_label && (
            <button type="button" className="pp-undo" onClick={doUndo} disabled={undoing}>
              {view.undo_label}
            </button>
          )}
          <p className="pp-provenance">
            {programNames.length > 0 && <>{programNames.join(', ')} · </>}
            Curated requirements, not an official audit
            {asOf && <> · {school} sections as of {asOf}</>}
          </p>
        </header>

        <section aria-labelledby="pp-courses-h">
          <SectionHeading id="pp-courses-h">Courses</SectionHeading>
          <ul className="pp-list">
            {courses.map((course) => (
              <CourseRow
                key={`${flashKey}-${course.id}`}
                course={course}
                preview={preview}
                flash={!!preview && (preview.removed.has(course.id) || preview.moved.has(course.id))}
                solid={solid.has(course.id)}
                onOpen={onOpenCourse}
                onRemove={proposal ? null : removeCourse}
              />
            ))}
            {[...added, ...movedIn.map((m) => m.id)].map((id) => {
              // The diff carries the added course's report row (title, credits, difficulty).
              const row = (proposal?.diff?.added_courses || []).find((c) => c.id === id) || {};
              const credits = creditSpan(row.credits);
              return (
                <li key={`${flashKey}-add-${id}`} className="pp-course is-addition pp-flash">
                  <button type="button" className="pp-course-main" onClick={() => onOpenCourse?.(id)}>
                    <span className="pp-course-name">
                      <span className="pp-course-code">{id}</span> {row.title}
                    </span>
                    <span className="pp-course-meta">
                      {credits ? ` · ${credits} cr` : ''}
                      <span className="pp-proposed-label"> · Proposed addition</span>
                    </span>
                  </button>
                  {'harder' in row && <Tag harder={row.harder} />}
                </li>
              );
            })}
            <AddSlot term={term} onPrefill={onPrefill} onAdd={(id) => runEdit([{ op: 'add', course: id }])} />
          </ul>
        </section>

        {report && <Summary report={report} preview={preview} school={school} />}

        <section aria-labelledby="pp-req-h">
          <SectionHeading id="pp-req-h">Requirements</SectionHeading>
          {rules.length === 0 ? (
            <p className="pp-muted">
              {(profile.program_ids || []).length
                ? 'No requirement rules to check yet.'
                : 'Tell me your program to check requirements.'}
            </p>
          ) : (
            <ul className="pp-list">
              {rules.map((rule) => {
                const change = preview?.rules.get(`${rule.program_id || ''}:${rule.rule_id}`);
                return (
                  <RuleRow
                    key={`${flashKey}-${rule.program_id}-${rule.rule_id}`}
                    rule={rule}
                    change={change}
                    flash={!!change}
                    school={school}
                  />
                );
              })}
            </ul>
          )}
          {(profile.program_ids || []).length > 0 && (
            <button type="button" className="pp-link" onClick={() => setMode('checklist')}>Tick off courses</button>
          )}
        </section>

        <section aria-labelledby="pp-week-h">
          <SectionHeading id="pp-week-h">Weekly schedule</SectionHeading>
          {report && <WeekSchedule report={report} preview={preview} proposal={proposal} school={school} />}
        </section>

        {(later.length > 0 || movingOut.length > 0) && (
          <section aria-labelledby="pp-later-h">
            <SectionHeading id="pp-later-h">Later</SectionHeading>
            <ul className="pp-list pp-later">
              {later.map((c) => <li key={c.id}>{c.id} · {c.term}</li>)}
              {movingOut.map((m) => (
                <li key={`move-${m.id}`} className="pp-proposed-label">{m.id} · moves to {m.to} · Proposed</li>
              ))}
            </ul>
          </section>
        )}
      </>
    );
  }

  return (
    <div
      ref={regionRef}
      className={`plan-panel is-${variant}`}
      role="region"
      aria-label="Your plan"
      onKeyDown={onKeyDown}
    >
      {onClose && (
        <button ref={closeRef} type="button" className="pp-close" aria-label="Close plan" onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
      )}
      {notice === 'conflict' && <ConflictNotice onDismiss={planner.dismissNotice} />}
      {body}
    </div>
  );
}
