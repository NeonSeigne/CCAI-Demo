import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { UndoRounded, RedoRounded } from '../../icons';
import { usePlanner } from '../../../contexts/PlannerContext';
import { useOpenCourse } from '../../../utils/openCourse';
import { useDropToast } from '../../dnd';
import { InlineError } from '../../catalog/CatalogParts';
import DegreeSummary, { DegreeSummarySkeleton } from './DegreeSummary';
import TermColumn, { TermColumnSkeleton } from './TermColumn';
import { PastColumn, PastTermColumn } from './PastColumn';
import SetupDialog from './SetupDialog';
import RouteMap, { RouteList } from './RouteMap';
import { NOT_PLACED, routeModel } from './routeModel';
import {
  creditsOf, groupTone, nextTerm, parseTerm, pastTerms, sortTerms, termOrder,
} from './degreeFormat';
import '../../../styles/DegreeBoard.css';

const PULSE_MS = 700;

// Map or Semesters (Phase 2 P.3): Map on a first visit, then the last choice.
export const VIEW_KEY = 'cc.degree.view.v1';
const readView = () => {
  try {
    return window.localStorage.getItem(VIEW_KEY) === 'semesters' ? 'semesters' : 'map';
  } catch {
    return 'map';
  }
};
const writeView = (value) => {
  try {
    window.localStorage.setItem(VIEW_KEY, value);
  } catch {
    // Blocked storage: the choice holds for this visit only.
  }
};

const sameIds = (a, b) => a.length === b.length && a.every((id) => b.includes(id));

/**
 * Term names on the board: the plan's term and every planned term, every
 * regular term between the first and the last, then one empty term after.
 */
export function boardTerms(degree, planCourses) {
  const names = new Set([
    ...(degree?.terms || []).map((t) => t.term),
    ...planCourses.map((c) => c.term).filter(Boolean),
  ]);
  if (degree?.term) names.add(degree.term);
  const known = sortTerms([...names]).filter((t) => parseTerm(t));
  if (known.length) {
    const last = termOrder(known[known.length - 1]);
    let term = known[0];
    for (let i = 0; i < 40 && term && termOrder(term) < last; i += 1) {
      term = nextTerm(term);
      if (term && termOrder(term) < last) names.add(term);
    }
    const after = nextTerm(known[known.length - 1]);
    if (after) names.add(after);
  }
  return sortTerms([...names]);
}

/**
 * What a course dropped on `term` does (D8): a board card moves, a new
 * course is added, and one already planned (or already taken) springs back.
 */
export function dropAction(item, term, planCourses, completedIds = new Set()) {
  if (item?.type !== 'course' || !item.id) return null;
  const placed = planCourses.find((c) => c.id === item.id);
  if (placed && placed.term === term) return 'spring';
  if (placed && item.extra?.from === 'board') return 'move';
  if (placed || completedIds.has(item.id)) return 'spring';
  return 'add';
}

/**
 * My degree (design D4, D5, D8, D13, D17–D19, D22; eng R12–R14; CEO O2):
 * the waffle and totals on top, then term columns that scroll sideways.
 * Courses drag between terms and onto "+" slots, Browse rows drag in, and
 * every card's ⋯ menu does the same without dragging.
 *
 * Course placement follows the plan view (which shows queued edits at
 * once); titles, credits and labels come from the degree read, refetched
 * whenever the plan moves past it.
 */
export default function DegreeBoard({ head = null }) {
  const planner = usePlanner();
  const [, setSearchParams] = useSearchParams();
  const toast = useDropToast();
  const {
    view, degree, refreshDegree, programs, edit, undo, redo, canUndo, canRedo, undoLabel, redoLabel,
    queueState, retry, ensureLoaded,
  } = planner;

  const [loadState, setLoadState] = useState(degree ? 'ready' : 'loading');
  const [pulseId, setPulseId] = useState(null);
  const [showPast, setShowPast] = useState(false);
  const [boardView, setBoardView] = useState(readView);
  const chooseView = useCallback((value) => {
    setBoardView(value);
    writeView(value);
  }, []);
  // The setup dialog and the step it opens at (0 Program, 1 Completed, 2 First term).
  const [setup, setSetup] = useState({ open: false, step: 0 });
  const autoOpened = useRef(false);
  const openSetup = useCallback((step) => setSetup({ open: true, step }), []);
  const pulseTimer = useRef(null);
  const haveDegree = Boolean(degree);

  useEffect(() => { ensureLoaded?.(); }, [ensureLoaded]);

  const revision = view?.plan?.revision;
  const revisionRef = useRef(revision);
  revisionRef.current = revision;
  const catchUps = useRef(0);

  /**
   * Read the degree. A read joined while edits kept landing can settle on an
   * older revision than the plan's; then read again (a few times at most).
   */
  const fetchDegree = useCallback(function read(force = false) {
    if (!haveDegree) setLoadState('loading');
    return refreshDegree({ force }).then(
      (data) => {
        setLoadState('ready');
        const latest = revisionRef.current;
        const behind = data && latest != null && (data.revision ?? -1) < latest;
        if (behind && catchUps.current < 3) {
          catchUps.current += 1;
          read();
        } else if (!behind) {
          catchUps.current = 0;
        }
      },
      () => setLoadState((current) => (haveDegree ? current : 'error')),
    );
  }, [haveDegree, refreshDegree]);

  useEffect(() => { fetchDegree(); }, [revision]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearTimeout(pulseTimer.current), []);

  const profile = useMemo(() => view?.plan?.profile || {}, [view]);
  const programIds = profile.program_ids || [];
  const hasPrograms = (programs || []).length > 0;
  const program = (programs || []).find((p) => p.id === programIds[0]) || null;

  // Every course the degree read knows, by id.
  const details = useMemo(() => {
    const map = new Map();
    (degree?.terms || []).forEach((t) => (t.courses || []).forEach((c) => map.set(c.id, { ...c, term: t.term })));
    return map;
  }, [degree]);

  const planCourses = useMemo(() => {
    if (view?.plan?.courses) return view.plan.courses;
    return [...details.values()].map((c) => ({ id: c.id, term: c.term }));
  }, [view, details]);

  const completed = useMemo(() => degree?.completed || [], [degree]);
  const completedIds = useMemo(() => new Set(completed.map((c) => c.id)), [completed]);
  const waffle = degree?.waffle || null;
  const groups = useMemo(() => waffle?.groups || [], [waffle]);

  const tones = useMemo(() => {
    const out = {};
    groups.forEach((group, index) => { if (group.title) out[group.title] = groupTone(group, index); });
    return out;
  }, [groups]);

  const courseTone = useCallback((id) => {
    const index = groups.findIndex((group) => group.rule_id && (group.courses || []).includes(id));
    return index === -1 ? 'other' : groupTone(groups[index], index);
  }, [groups]);

  const terms = useMemo(() => boardTerms(degree, planCourses), [degree, planCourses]);

  const columns = useMemo(() => terms.map((term) => {
    const courses = planCourses
      .filter((c) => c.term === term)
      .map((c) => details.get(c.id) || {
        id: c.id, title: null, credits: null, avg_gpa: null, requirements: [], pending: true,
      });
    const fromServer = (degree?.terms || []).find((t) => t.term === term);
    const same = fromServer && sameIds((fromServer.courses || []).map((c) => c.id), courses.map((c) => c.id));
    let credits;
    if (same) {
      const min = fromServer.credits?.min;
      credits = { min: min ?? 0, known: min != null && fromServer.credits?.status !== 'unknown' };
    } else {
      credits = creditsOf(courses);
    }
    return {
      term,
      courses,
      credits,
      load: same && courses.length ? fromServer.difficulty?.label || null : null,
      limits: fromServer?.credits?.limits || null,
    };
  }), [terms, planCourses, details, degree]);

  const past = useMemo(() => pastTerms(completed), [completed]);

  const route = useMemo(() => routeModel(degree, planCourses, profile), [degree, planCourses, profile]);
  const hasRoute = route.lines.length > 0;
  const showMap = hasRoute && boardView === 'map';

  const titles = useMemo(() => {
    const out = {};
    completed.forEach((c) => { if (c.title) out[c.id] = c.title; });
    details.forEach((c) => { if (c.title) out[c.id] = c.title; });
    return out;
  }, [completed, details]);

  const pulse = useCallback((id) => {
    clearTimeout(pulseTimer.current);
    setPulseId(id);
    pulseTimer.current = setTimeout(() => setPulseId(null), PULSE_MS);
  }, []);

  const onUndo = useCallback(() => { undo().catch(() => {}); }, [undo]);
  const onRedo = useCallback(() => { redo().catch(() => {}); }, [redo]);

  const move = useCallback((id, term) => {
    edit([{ op: 'move', course: id, to_term: term }], {
      onSaved: () => toast.done(`Moved to ${term}`, { onUndo }),
    }).catch(() => {});
  }, [edit, toast, onUndo]);

  const add = useCallback((id, term) => {
    edit([{ op: 'add', course: id, term }], {
      onSaved: () => toast.done(`Added to ${term}`, { onUndo }),
    }).catch(() => {});
  }, [edit, toast, onUndo]);

  const remove = useCallback((course) => {
    edit([{ op: 'remove', course: course.id }], {
      onSaved: () => toast.done(`Removed ${course.id}`, { onUndo }),
    }).catch(() => {});
  }, [edit, toast, onUndo]);

  /** A course dropped on a term (D8): move a card, add a new course, or spring back. */
  const onDrop = useCallback((item, term) => {
    const action = dropAction(item, term, planCourses, completedIds);
    if (action === 'move') move(item.id, term);
    else if (action === 'add') add(item.id, term);
    else if (action === 'spring') pulse(item.id);
  }, [planCourses, completedIds, pulse, move, add]);

  const openCourse = useOpenCourse();

  const openSemester = useCallback((term) => {
    setSearchParams({ view: 'semester', term });
  }, [setSearchParams]);

  // Opens by itself on each visit while the plan has no program (eng review D6).
  const needsProgram = Boolean(view?.plan) && hasPrograms && !programIds.length;
  useEffect(() => {
    if (needsProgram && !autoOpened.current) {
      autoOpened.current = true;
      openSetup(0);
    }
  }, [needsProgram, openSetup]);

  let top = null;
  if (loadState === 'loading' && !degree) top = <DegreeSummarySkeleton />;
  else if (hasPrograms && programIds.length && waffle && groups.length) {
    top = <DegreeSummary name={program?.name || null} waffle={waffle} />;
  }

  const lastTerm = [...route.terms].reverse().find((t) => t !== NOT_PLACED);

  let board;
  if (showMap) {
    board = (
      <div className="rt-view">
        <section className="rt-card" aria-labelledby="rt-title">
          <h3 id="rt-title">{lastTerm ? `Route to ${lastTerm}` : 'Route'}</h3>
          <RouteMap model={route} onOpen={openCourse} />
        </section>
        <RouteList model={route} onOpen={openCourse} />
      </div>
    );
  } else if (loadState === 'error' && !degree) {
    board = <InlineError message="Couldn't load" onRetry={() => fetchDegree(true)} />;
  } else if (!degree) {
    board = (
      <div className="dg-terms" aria-busy="true">
        <TermColumnSkeleton />
      </div>
    );
  } else {
    board = (
      <div className="dg-terms" role="region" aria-label="Terms" tabIndex={0}>
        {past.length > 0 && (
          <PastColumn
            past={past}
            courseTone={courseTone}
            expanded={showPast}
            onToggle={() => setShowPast((on) => !on)}
            onEditCompleted={() => openSetup(1)}
          />
        )}
        {showPast && [...past].reverse().map((entry) => (
          <PastTermColumn key={entry.term} entry={entry} onOpen={openCourse} />
        ))}
        {columns.map((column) => (
          <TermColumn
            key={column.term}
            term={column.term}
            courses={column.courses}
            credits={column.credits}
            load={column.load}
            limits={column.limits}
            terms={terms}
            tones={tones}
            showRequirements={hasPrograms}
            current={column.term === degree.term}
            pulseId={pulseId}
            onDrop={onDrop}
            onOpen={openCourse}
            onMove={(course, term) => move(course.id, term)}
            onRemove={remove}
            onOpenSemester={openSemester}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="dg-board">
      <div className="dg-toolbar">
        {head}
        {program && (
          <div className="dg-program">
            <h2>
              <button type="button" className="dg-program-btn" onClick={() => openSetup(0)}>{program.name}</button>
            </h2>
            {profile.catalog_year && <span className="dg-catalog">Catalog {profile.catalog_year}</span>}
          </div>
        )}
        {!program && hasPrograms && (
          <button type="button" className="cc-btn dg-program-pick" onClick={() => openSetup(0)}>Program</button>
        )}
        {hasRoute && (
          <div className="cc-segmented dg-view-switch" role="group" aria-label="View">
            <button type="button" aria-pressed={boardView === 'map'} onClick={() => chooseView('map')}>Map</button>
            <button type="button" aria-pressed={boardView === 'semesters'} onClick={() => chooseView('semesters')}>
              Semesters
            </button>
          </div>
        )}
        <div className="dg-history">
          <button
            type="button"
            className="dg-icon-btn"
            aria-label={undoLabel || 'Undo'}
            title={undoLabel || 'Undo'}
            disabled={!canUndo}
            onClick={onUndo}
          >
            <UndoRounded fontSize="small" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="dg-icon-btn"
            aria-label={redoLabel || 'Redo'}
            title={redoLabel || 'Redo'}
            disabled={!canRedo}
            onClick={onRedo}
          >
            <RedoRounded fontSize="small" aria-hidden="true" />
          </button>
        </div>
      </div>

      {queueState === 'error' && <InlineError message="Couldn't save" onRetry={retry} />}
      {top}
      {board}

      <SetupDialog
        open={setup.open}
        step={setup.step}
        onClose={() => setSetup((current) => ({ ...current, open: false }))}
        planner={planner}
        degree={degree}
        terms={terms}
        titles={titles}
      />
    </div>
  );
}
