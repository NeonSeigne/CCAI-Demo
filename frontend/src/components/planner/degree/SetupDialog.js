import React, {
  useEffect, useMemo, useRef, useState,
} from 'react';
import AppDialog from '../../AppDialog';
import ConfirmDialog from '../../ConfirmDialog';
import { usePageColumn } from '../../shell/PageColumnContext';
import { InlineError, useDebounced } from '../../catalog/CatalogParts';
import { searchCatalog } from '../../../api/campus';
import { uploadTranscript } from '../../../api/planner';
import { useAuth } from '../../../contexts/AuthContext';
import { GRADES, normalizeCourseId } from '../completedCourses';
import { checklistCourses } from '../checklist';
import { Icon } from '../../icons';
import { groupTone, openRequirements, waffleModel } from './degreeFormat';
import { SheetBand } from '../../../modules/sheet';
import StartTermField from './StartTermField';

const SEARCH_LIMIT = 8;
const STEPS = ['Program', 'Completed', 'First term'];
const ACCEPT = '.pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain';

/** "2026–27" for a catalog year. */
export const catalogLabel = (year) => (year ? `${year}–${String(Number(year) + 1).slice(-2)}` : null);

/** The four class years a student can pick, from next year on. */
export function classYears(today = new Date()) {
  const first = today.getFullYear() + 1;
  return [first, first + 1, first + 2, first + 3].map(String);
}

/** Start terms a student can pick (R10): Fall and Spring, from five years back to this year. */
export function startTerms(today = new Date()) {
  const year = today.getFullYear();
  const out = [];
  for (let y = year - 5; y <= year; y += 1) out.push(`Spring ${y}`, `Fall ${y}`);
  return out;
}

/** The saved start term, else Fall four years before the class year (R10). */
export const defaultStartTerm = (startTerm, classYear) => (
  startTerm || (classYear ? `Fall ${Number(classYear) - 4}` : null));

/** Programs in two groups, graduate programs last (eng review D2). */
function programGroups(programs) {
  const sorted = [...(programs || [])].sort((a, b) => a.name.localeCompare(b.name));
  return [
    { label: 'Undergraduate', programs: sorted.filter((p) => p.type !== 'graduate') },
    { label: 'Graduate', programs: sorted.filter((p) => p.type === 'graduate') },
  ].filter((group) => group.programs.length);
}

/**
 * First term's compact preview (first-run B, b3-first-term): a small credit
 * grid with the credits done in their requirement colours, "Credits done",
 * "Open requirements", and a chip per requirement, met ones struck through.
 */
export function FirstTermPreview({ waffle, toneOf }) {
  const { groups, totals } = waffleModel(waffle, toneOf);
  const done = groups.flatMap((g) => Array(g.earned).fill(g.tone));
  const size = Math.max(50, Math.ceil((done.length + 1) / 10) * 10);
  const rules = groups.filter((g) => g.rule_id);
  return (
    <div className="su-preview">
      <div className="su-grid" aria-hidden="true">
        {Array.from({ length: size }, (_, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <i key={i} className={done[i] ? `is-done tone-${done[i]}` : ''} />
        ))}
      </div>
      <div>
        <div className="su-figures">
          <div><b>{totals.earned}</b><span>Credits done</span></div>
          <div><b>{openRequirements(waffle)}</b><span>Open requirements</span></div>
        </div>
        <ul className="su-open" aria-label="Requirements">
          {rules.map((g) => (
            <li key={g.rule_id} className={`tone-${g.tone} ${g.status === 'met' ? 'is-met' : ''}`.trim()}>
              <i aria-hidden="true" />
              {g.status === 'met' ? <s>{g.title}</s> : g.title}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** A completed entry as `set_profile` takes it; credits only when the transcript gave them (R10). */
const entryOf = (row) => {
  const entry = { id: row.id, grade: row.grade ?? null, term: row.term ?? null };
  if (typeof row.credits === 'number') entry.credits = row.credits;
  return entry;
};

const sameEntry = (a, b) => (a.grade ?? null) === (b.grade ?? null)
  && (a.term ?? null) === (b.term ?? null) && (a.credits ?? null) === (b.credits ?? null);

/**
 * Setup for My degree (docs/designs/setup-dialog.md): Program, Completed
 * (with transcript upload) and First term. Each step saves on Next through
 * one planner edit (D4); a held save shows Retry and the step moves on when
 * the queued edit lands (R12). Opened at any step from the board.
 */
export default function SetupDialog({
  open, step: initialStep = 0, onClose, planner, degree, terms = [], titles = {}, ruleTones = {},
}) {
  const container = usePageColumn();
  const { authToken } = useAuth();
  const plan = planner?.view?.plan || {};
  const profile = useMemo(() => plan.profile || {}, [plan.profile]);
  const completed = useMemo(() => profile.completed || [], [profile.completed]);
  const programs = useMemo(() => planner?.programs || [], [planner?.programs]);

  const [step, setStep] = useState(initialStep);
  const [programId, setProgramId] = useState(null);
  const [classYear, setClassYear] = useState(null);
  const [startTerm, setStartTerm] = useState(null);
  const [rows, setRows] = useState(() => new Map());
  const [extra, setExtra] = useState([]);
  const [names, setNames] = useState({});
  const [found, setFound] = useState({});
  const [upload, setUpload] = useState({ status: 'idle', name: null, count: 0 });
  const [dragOver, setDragOver] = useState(false);
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query.trim());
  const [results, setResults] = useState({ status: 'idle', courses: [] });
  const [term, setTerm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  // What a confirmed "Discard changes?" does: 'close' the dialog or 'skip' this step.
  const [confirming, setConfirming] = useState(null);
  // Bumped on every open, so an edit landing after a close never moves a new session on.
  const session = useRef(0);
  // The ops of this dialog's last failed save, so only its own error is cleared.
  const ownFailure = useRef(null);
  const lastSave = useRef(null);
  const fileInput = useRef(null);

  // Start from the saved plan each time it opens.
  useEffect(() => {
    if (!open) return;
    session.current += 1;
    setStep(initialStep);
    setProgramId((profile.program_ids || [])[0] || null);
    setClassYear(profile.class_year ? String(profile.class_year) : null);
    setStartTerm(profile.start_term || null);
    setRows(new Map(completed.map((c) => [c.id, entryOf(c)])));
    setExtra([]);
    setFound({});
    setUpload({ status: 'idle', name: null, count: 0 });
    setQuery('');
    setTerm(plan.term || null);
    setSaving(false);
    setFailed(false);
    setConfirming(null);
  }, [open, initialStep]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || step !== 1 || !debounced || !authToken) {
      setResults({ status: 'idle', courses: [] });
      return undefined;
    }
    const controller = new AbortController();
    setResults((current) => ({ ...current, status: 'loading' }));
    searchCatalog(authToken, { q: debounced, limit: SEARCH_LIMIT }, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setResults({ status: 'ready', courses: data?.courses || [] });
      })
      .catch((error) => {
        if (!controller.signal.aborted && error?.name !== 'AbortError') setResults({ status: 'error', courses: [] });
      });
    return () => controller.abort();
  }, [open, step, debounced, authToken]);

  const program = programs.find((p) => p.id === programId) || null;
  const savedProgramId = (profile.program_ids || [])[0] || null;
  const programDirty = programId !== savedProgramId
    || (classYear || null) !== (profile.class_year ? String(profile.class_year) : null)
    || (startTerm || null) !== (profile.start_term || null);

  const saved = useMemo(() => new Map(completed.map((c) => [c.id, entryOf(c)])), [completed]);
  const completedDirty = rows.size !== saved.size
    || [...rows.values()].some((row) => !saved.has(row.id) || !sameEntry(saved.get(row.id), row));
  const termDirty = Boolean(term) && term !== plan.term;
  const dirty = [programDirty, completedDirty, termDirty][step];

  // Transcript rows first, under "Found N"; then the program's checklist and added courses.
  const foundIds = Object.keys(found);
  const courses = [...new Set([
    ...foundIds,
    ...checklistCourses(programId ? [programId] : [], programs, planner?.view?.report, completed),
    ...extra,
  ])];
  const titleOf = (id) => names[id] || titles[id] || null;
  const foundCount = foundIds.length;
  const tickedCredits = [...rows.values()].reduce((sum, row) => {
    const value = typeof row.credits === 'number' ? row.credits : found[row.id]?.credits;
    return sum + (typeof value === 'number' ? value : 0);
  }, 0);
  // One colour per requirement (Phase 8.5): a rule's route-line colour, else the course colours.
  const toneOf = (group, index) => (group?.rule_id && ruleTones[`${group.program_id}:${group.rule_id}`])
    || groupTone(group, index);

  /** A row as it was saved, else as the transcript read it, so re-ticking restores it. */
  const restoredRow = (id) => saved.get(id) || entryOf({ id, ...(found[id] || {}) });

  const toggle = (id) => setRows((current) => {
    const next = new Map(current);
    if (next.has(id)) next.delete(id);
    else next.set(id, restoredRow(id));
    return next;
  });

  const setGrade = (id, grade) => setRows((current) => {
    const next = new Map(current);
    next.set(id, { ...(next.get(id) || { id, term: null }), grade: grade || null });
    return next;
  });

  const add = (id, title) => {
    const norm = normalizeCourseId(id);
    if (!norm) return;
    if (title) setNames((current) => ({ ...current, [norm]: title }));
    setExtra((current) => (current.includes(norm) ? current : [...current, norm]));
    setRows((current) => (current.has(norm) ? current : new Map(current).set(norm, restoredRow(norm))));
    setQuery('');
  };

  /** Enter adds the result the text names exactly, else the first result; never free text. */
  const addFromSearch = () => {
    if (results.status !== 'ready' || !results.courses.length) return;
    const typed = normalizeCourseId(query);
    const match = results.courses.find((c) => normalizeCourseId(c.identifier) === typed) || results.courses[0];
    add(match.identifier, match.title);
  };

  /** Transcript rows join the list: passed courses ticked, the rest listed unticked (R9). */
  const readTranscript = async (file) => {
    if (!file) return;
    const mine = session.current;
    setUpload({ status: 'loading', name: file.name, count: 0 });
    try {
      const data = await uploadTranscript(authToken, file);
      if (session.current !== mine) return;
      const list = (data?.rows || []).filter((row) => row?.id);
      setFound(Object.fromEntries(list.map((row) => [row.id, row])));
      setNames((current) => ({
        ...current, ...Object.fromEntries(list.filter((row) => row.title).map((row) => [row.id, row.title])),
      }));
      setExtra((current) => [...new Set([...current, ...list.map((row) => row.id)])]);
      setRows((current) => {
        const next = new Map(current);
        list.forEach((row) => {
          if (row.ticked) next.set(row.id, entryOf(row));
          else next.delete(row.id);
        });
        return next;
      });
      setUpload({ status: 'done', name: file.name, count: list.length });
    } catch {
      if (session.current === mine) setUpload({ status: 'error', name: file.name, count: 0 });
    }
  };

  /**
   * Save one step through a planner edit (D4). A hold shows "Couldn't save"
   * with Retry and keeps Next off; the step moves on when the edit lands (R12).
   */
  const save = (ops, after) => {
    if (planner.queueHeld) {
      setFailed(true);
      return;
    }
    const error = planner.saveError;
    if (error && !error.held && ownFailure.current && error.ops === ownFailure.current) {
      planner.dismissSaveError?.();
    }
    const mine = session.current;
    lastSave.current = { ops, after };
    setSaving(true);
    setFailed(false);
    planner.edit(ops, { onHold: () => { if (session.current === mine) setFailed(true); } })
      .then(() => {
        if (session.current !== mine) return;
        ownFailure.current = null;
        setSaving(false);
        setFailed(false);
        after();
      })
      .catch(() => {
        if (session.current !== mine) return;
        ownFailure.current = ops;
        setSaving(false);
        setFailed(true);
      });
  };

  const retry = () => {
    if (planner.queueHeld) {
      planner.retry();
      if (!saving) setFailed(false);
    } else if (lastSave.current) {
      save(lastSave.current.ops, lastSave.current.after);
    }
  };

  const next = () => setStep((current) => Math.min(current + 1, STEPS.length - 1));

  const onNext = () => {
    if (step === 0) {
      if (!programDirty) { next(); return; }
      const op = { op: 'set_profile', program_ids: programId ? [programId] : [] };
      if (program?.catalog_year) op.catalog_year = program.catalog_year;
      op.class_year = classYear || null;
      op.start_term = startTerm || null;
      save([op], next);
    } else if (step === 1) {
      if (!completedDirty) { next(); return; }
      save([{ op: 'set_profile', completed: [...rows.values()].map(entryOf) }], next);
    } else if (termDirty) {
      save([{ op: 'set_term', term }], onClose);
    } else {
      onClose();
    }
  };

  /** Put the step back to what's saved, after its changes are discarded. */
  const resetStep = () => {
    if (step === 0) {
      setProgramId(savedProgramId);
      setClassYear(profile.class_year ? String(profile.class_year) : null);
      setStartTerm(profile.start_term || null);
    } else if (step === 1) {
      setRows(new Map(completed.map((c) => [c.id, entryOf(c)])));
      setExtra([]);
      setFound({});
      setUpload({ status: 'idle', name: null, count: 0 });
    }
  };

  /** Close at once when nothing changed on this step; otherwise confirm discarding. */
  const requestClose = () => {
    if (dirty && !saving) setConfirming('close');
    else onClose();
  };

  /** Skip moves on without saving; with changes on the step, it asks first. */
  const requestSkip = () => {
    if (dirty) setConfirming('skip');
    else next();
  };

  const discard = () => {
    const action = confirming;
    setConfirming(null);
    if (action === 'skip') {
      resetStep();
      next();
    } else {
      onClose();
    }
  };

  const catalogYear = program?.catalog_year || (programId === savedProgramId ? profile.catalog_year : null);
  const groups = programGroups(programs);
  // Terms set_term accepts (R1): the plan's term, and board terms the school's data covers or that hold courses.
  const known = new Set((degree?.terms || []).filter((t) => t.covered || (t.courses || []).length).map((t) => t.term));
  const shownTerms = [...new Set([plan.term, ...terms.filter((name) => known.has(name))].filter(Boolean))];
  const busy = saving;

  const body = [
    <div key="program" className="su-program">
      <div className="su-program-list" role="radiogroup" aria-label="Programs">
        {groups.map((group) => (
          <div key={group.label} className="su-group">
            <p className="dg-label">{group.label}</p>
            {group.programs.map((p) => (
              <label key={p.id} className={`su-program-row ${p.id === programId ? 'is-on' : ''}`.trim()}>
                <input
                  type="radio"
                  name="su-program"
                  value={p.id}
                  checked={p.id === programId}
                  onChange={() => setProgramId(p.id)}
                />
                <span className="su-program-name">{p.name}</span>
                <span className="su-count">{(p.rules || []).length}</span>
              </label>
            ))}
          </div>
        ))}
      </div>
      {program && (
        <section className="su-rules" aria-label={program.name}>
          <header className="su-rules-head">
            <strong>{program.name}</strong>
            {program.total_credits != null && <span className="su-count">{program.total_credits} cr</span>}
          </header>
          <ul>
            {(program.rules || []).map((rule, index) => (
              <li key={rule.id || rule.title} className={`tone-${ruleTones[`${program.id}:${rule.id}`] || `c${(index % 6) + 1}`}`}>
                <i className="su-dot" aria-hidden="true" />
                {rule.title}
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="su-side">
        {catalogYear && (
          <div className="su-field">
            <span className="dg-label">Catalog year</span>
            <span className="su-catalog">{catalogLabel(catalogYear)}</span>
          </div>
        )}
        <div className="su-field" role="radiogroup" aria-label="Class year">
          <span className="dg-label" aria-hidden="true">Class year</span>
          <div className="su-years">
            {classYears().map((year) => (
              <button
                key={year}
                type="button"
                role="radio"
                aria-checked={classYear === year}
                className={`su-chip ${classYear === year ? 'is-on' : ''}`.trim()}
                onClick={() => {
                  const picked = classYear === year ? null : year;
                  // Follow the class year until a start term is picked by hand.
                  if (startTerm === defaultStartTerm(null, classYear)) setStartTerm(defaultStartTerm(null, picked));
                  setClassYear(picked);
                }}
              >
                {year}
              </button>
            ))}
          </div>
        </div>
        <StartTermField
          value={startTerm}
          terms={[...new Set([...startTerms(), ...(startTerm ? [startTerm] : [])])]}
          onChange={setStartTerm}
        />
      </div>
    </div>,

    <div key="completed" className="su-completed">
      {/* The dashed drop zone (first-run B): drop a file or choose one. */}
      <div
        className={`su-drop ${dragOver ? 'is-over' : ''}`.trim()}
        onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          readTranscript(event.dataTransfer?.files?.[0]);
        }}
      >
        <Icon name="upload" size={30} className="su-drop-glyph" />
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          aria-label="Transcript file"
          onChange={(event) => { readTranscript(event.target.files?.[0]); event.target.value = ''; }}
        />
        <button
          type="button"
          className="dg-btn is-primary su-upload-btn"
          disabled={upload.status === 'loading'}
          onClick={() => fileInput.current?.click()}
        >
          Upload transcript
        </button>
        <span className="su-soft">PDF · DOCX · TXT</span>
        {upload.name && upload.status !== 'error' && (
          <span className="su-file" aria-busy={upload.status === 'loading'}>
            {upload.status === 'done' && <Icon name="check" size={18} className="su-file-ok" />}
            {upload.name}
          </span>
        )}
        {upload.status === 'error' && <InlineError message="Couldn't read this file" />}
      </div>

      <div className="su-found-panel">
        {foundCount > 0 && (
          <div className="su-found-head">
            <b>{`Found ${foundCount}`}</b>
            <span className="su-soft">{`${tickedCredits} cr`}</span>
          </div>
        )}
        <ul className="dg-editor-list" aria-label="Courses">
          {courses.map((id) => {
            const row = rows.get(id);
            const title = titleOf(id);
            const meta = found[id];
            const flag = meta && (meta.in_catalog === false ? 'Not in catalog' : meta.checked === false ? 'Not checked' : null);
            const credits = typeof row?.credits === 'number' ? row.credits : meta?.credits;
            const options = row?.grade && !GRADES.includes(row.grade) ? [row.grade, ...GRADES] : GRADES;
            return (
              <li key={id} className={`su-row ${flag ? 'is-flagged' : ''}`.trim()}>
                <input
                  id={`su-tick-${id}`}
                  type="checkbox"
                  checked={Boolean(row)}
                  onChange={() => toggle(id)}
                />
                <label htmlFor={`su-tick-${id}`} className="su-code">{id}</label>
                {flag
                  ? <span className="su-row-title su-flag">{flag}</span>
                  : <span className="su-row-title">{title}</span>}
                {row ? (
                  <select
                    className="su-grade"
                    aria-label={`Grade for ${id}`}
                    value={row.grade || ''}
                    onChange={(event) => setGrade(id, event.target.value)}
                  >
                    <option value="">—</option>
                    {options.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                  </select>
                ) : <span className="su-grade">{meta?.grade || '—'}</span>}
                <span className="su-credits">{credits != null ? credits : '—'}</span>
              </li>
            );
          })}
        </ul>
        <div className="su-add">
          <label htmlFor="su-search" className="sr-only">Search courses</label>
          <input
            id="su-search"
            type="search"
            value={query}
            autoComplete="off"
            placeholder="Course code"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addFromSearch();
              }
            }}
          />
          {results.status === 'ready' && results.courses.length > 0 && (
            <ul className="dg-editor-results" aria-label="Search results">
              {results.courses.map((course) => (
                <li key={course.identifier}>
                  <span>
                    <span className="su-code">{course.identifier}</span>
                    {course.title && <span className="dg-editor-title"> {course.title}</span>}
                  </span>
                  <button
                    type="button"
                    className="dg-btn"
                    aria-label={`Add ${course.identifier}`}
                    disabled={rows.has(course.identifier)}
                    onClick={() => add(course.identifier, course.title)}
                  >
                    Add
                  </button>
                </li>
              ))}
            </ul>
          )}
          {results.status === 'error' && <InlineError message="Couldn't load" />}
        </div>
      </div>
    </div>,

    <div key="term" className="su-term">
      <div className="su-terms" role="radiogroup" aria-label="First term">
        {shownTerms.map((name) => (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={term === name}
            className={`su-chip ${term === name ? 'is-on' : ''}`.trim()}
            onClick={() => setTerm(name)}
          >
            {name}
          </button>
        ))}
      </div>
      {degree?.waffle?.groups?.length > 0 && <FirstTermPreview waffle={degree.waffle} toneOf={toneOf} />}
    </div>,
  ];

  const last = step === STEPS.length - 1;

  return (
    <>
      <AppDialog
        open={open}
        onClose={requestClose}
        container={container}
        aria-labelledby="su-title"
        fullWidth
        maxWidth="md"
        slotProps={{ paper: { className: `su-dialog ${step === 0 ? 'is-program' : ''}`.trim() } }}
      >
        <SheetBand
          className="su-band"
          eyebrow={(
            <>
              <div className="su-progress">
                <span>{`${step + 1} of ${STEPS.length}`}</span>
                <span className="su-bar" aria-hidden="true">
                  {STEPS.map((name, index) => (
                    <i key={name} className={index < step ? 'is-done' : index === step ? 'is-on' : ''} />
                  ))}
                </span>
              </div>
              <ol className="su-steps">
              {STEPS.map((name, index) => {
                let state = '';
                if (index === step) state = 'is-on';
                else if (index < step) state = 'is-done';
                return (
                  <li key={name} className={state} aria-current={index === step ? 'step' : undefined}>
                    <span className="su-num" aria-hidden="true">{index < step ? '✓' : index + 1}</span>
                    {name}
                  </li>
                );
                })}
              </ol>
            </>
          )}
          title={STEPS[step]}
          titleId="su-title"
          onClose={requestClose}
        />

        <div className="su-body">{body[step]}</div>

        <footer className="su-foot">
          {failed && <InlineError message="Couldn't save" onRetry={retry} />}
          {step > 0 ? (
            <button type="button" className="cc-btn" disabled={busy} onClick={() => setStep(step - 1)}>Back</button>
          ) : <span />}
          <div className="su-foot-end">
            {!last && <button type="button" className="cc-btn" disabled={busy} onClick={requestSkip}>Skip</button>}
            <button type="button" className="cc-btn cc-btn-primary" disabled={busy} onClick={onNext}>
              {last ? 'Done' : 'Next'}
            </button>
          </div>
        </footer>
      </AppDialog>
      <ConfirmDialog
        isOpen={Boolean(confirming)}
        title="Discard changes?"
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        tone="danger"
        onConfirm={discard}
        onCancel={() => setConfirming(null)}
      />
    </>
  );
}
