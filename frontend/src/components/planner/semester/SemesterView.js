import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDndContext } from '@dnd-kit/core';
import UndoRounded from '@mui/icons-material/UndoRounded';
import RedoRounded from '@mui/icons-material/RedoRounded';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import { usePlanner, termKey } from '../../../contexts/PlannerContext';
import { useChat } from '../../../contexts/ChatContext';
import { useAuth } from '../../../contexts/AuthContext';
import { getCatalogStarters, searchCatalog } from '../../../api/campus';
import { plannerError } from '../../../api/planner';
import { useDropTarget, useDropToast } from '../../dnd';
import { clashIds as clashIdsOf, creditSpan } from '../planFormat';
import { previewOf } from '../proposalDiff';
import useAcceptProposal from '../useAcceptProposal';
import { CreditsGauge, LoadGauge } from './Gauges';
import RequirementsTile from './RequirementsTile';
import CourseCard from './CourseCard';
import WeekTile, { useWeekTarget } from './WeekTile';
import SearchResults from './SearchResults';
import SwapSectionDialog from './SwapSectionDialog';
import useCourseDetails, { loadCourseSummary } from './useCourseDetails';
import {
  courseColours, difficultyOf, fittingPick, ruleGains,
} from './semesterData';
import { moveTargets, shiftTerm } from './semesterTerms';
import '../../../styles/SemesterView.css';

/**
 * One term of the plan (r9 UVA, r8-semester-2 UW): header with the
 * breadcrumb, ‹ › terms and undo / redo; Credits and Load gauges and the
 * Degree requirements tile on the left; wide course cards; the week where
 * the school publishes times.
 *
 * Drops (D4, D8): onto the course list or the week. A course already in the
 * term springs back and its card pulses; clash, prerequisites and over-limit
 * drops are allowed and the card shows its state. A pending proposal for
 * this term shows as ghosts (D9). While mounted, chat answers for this term
 * (O1).
 */

const FLASH_MS = 600;
const SEARCH_LIMIT = 8;
const SEARCH_DELAY = 300;

/** The courses and their sections, so a change can be highlighted (D10). */
const signatureOf = (rows, planCourses) => {
  const sections = new Map(planCourses.map((c) => [c.id, JSON.stringify(c.sections || null)]));
  return new Map(rows.filter((r) => !r.pending).map((r) => [r.id, sections.get(r.id) || 'null']));
};

function useChangeFlash(signature, ready) {
  const previous = useRef(null);
  const timer = useRef(null);
  const [flash, setFlash] = useState({ ids: new Set(), totals: false });

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (!ready) return;
    const before = previous.current;
    previous.current = signature;
    if (!before) return;
    const changed = [...signature.entries()].filter(([id, value]) => before.get(id) !== value).map(([id]) => id);
    const removed = [...before.keys()].some((id) => !signature.has(id));
    if (!changed.length && !removed) return;
    clearTimeout(timer.current);
    setFlash({ ids: new Set(changed), totals: true });
    timer.current = setTimeout(() => setFlash({ ids: new Set(), totals: false }), FLASH_MS);
  }, [signature, ready]);

  return flash;
}

function usePulse() {
  const [id, setId] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const pulse = useCallback((course) => {
    clearTimeout(timer.current);
    setId(null);
    const start = () => {
      setId(course);
      timer.current = setTimeout(() => setId(null), FLASH_MS);
    };
    if (window.requestAnimationFrame) window.requestAnimationFrame(start);
    else start();
  }, []);
  return [id, pulse];
}

function Skeleton() {
  return (
    <div className="sv-body" aria-busy="true" aria-label="Loading semester">
      <div className="sv-side">
        <div className="sv-tile sv-skel sv-skel-gauge" />
        <div className="sv-tile sv-skel sv-skel-gauge" />
      </div>
      <div className="sv-main">
        <div className="sv-tile sv-courses">
          <div className="sv-skel sv-skel-card" />
          <div className="sv-skel sv-skel-card" />
        </div>
      </div>
    </div>
  );
}

function LoadError({ onRetry }) {
  return (
    <p className="sv-error" role="alert">
      Couldn&apos;t load
      <span aria-hidden="true"> · </span>
      <button type="button" className="sv-link" onClick={onRetry}>Retry</button>
    </p>
  );
}

function PendingChange({ proposal, planner, onAccept }) {
  const state = planner.proposalState?.(proposal.id);
  const busy = state?.status === 'applying' || state?.status === 'discarding';
  return (
    <div className="sv-pending" role="group" aria-label="Pending change">
      <span className="sv-pending-label">Preview</span>
      <span className="sv-pending-heading">{proposal.diff?.heading}</span>
      <span className="sv-pending-actions">
        {!proposal.stale && (
          <button type="button" className="sv-btn is-primary" disabled={busy} onClick={() => onAccept(proposal)}>
            {state?.status === 'applying' ? 'Applying…' : 'Accept'}
          </button>
        )}
        <button type="button" className="sv-btn" disabled={busy} onClick={() => planner.discard(proposal)}>
          Discard
        </button>
      </span>
    </div>
  );
}

export default function SemesterView({ term }) {
  const planner = usePlanner();
  const chat = useChat();
  const { authToken } = useAuth() || {};
  const toast = useDropToast();
  const acceptProposal = useAcceptProposal();
  const [params] = useSearchParams();
  const { active } = useDndContext();

  const [lit, setLit] = useState(null);
  const [swap, setSwap] = useState(null);
  const [pulseId, pulse] = usePulse();
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState({ open: false, status: 'idle', results: [] });
  const [searchRun, setSearchRun] = useState(0);
  const [hoverCredits, setHoverCredits] = useState(null);
  const [swapSummary, setSwapSummary] = useState(null);
  const searchRef = useRef(null);

  const ensureLoaded = planner?.ensureLoaded;
  useEffect(() => { ensureLoaded?.(); }, [ensureLoaded]);

  // O1: chat answers for the open term while this view is up.
  const setActiveTerm = chat?.setActiveTerm;
  useEffect(() => {
    if (!setActiveTerm) return undefined;
    setActiveTerm(term);
    return () => setActiveTerm(null);
  }, [setActiveTerm, term]);

  const view = planner ? planner.viewFor(term) : null;
  const loadFailed = planner ? planner.termError(term) : null;
  const plan = view?.plan;
  const report = view?.report;
  const shownTerm = report?.term || term;

  const rows = useMemo(() => report?.courses || [], [report]);
  const planCourses = useMemo(
    () => (plan?.courses || []).filter((c) => termKey(c.term || plan.term) === termKey(shownTerm)),
    [plan, shownTerm],
  );
  const ids = useMemo(() => rows.map((r) => r.id), [rows]);

  // D9: a pending proposal drawn for this term.
  const proposal = planner?.pendingProposal || null;
  const touches = !!proposal?.diff && termKey(proposal.term || plan?.term) === termKey(shownTerm);
  const preview = useMemo(() => (touches ? previewOf(proposal) : null), [touches, proposal]);
  const ghostRows = useMemo(() => {
    if (!preview) return [];
    const incoming = [
      ...preview.added,
      ...[...preview.moved.values()].filter((m) => termKey(m.to) === termKey(shownTerm)).map((m) => m.id),
    ].filter((id) => !ids.includes(id));
    const known = proposal.diff.added_courses || [];
    return [...new Set(incoming)].map((id) => known.find((c) => c.id === id) || { id });
  }, [preview, proposal, ids, shownTerm]);
  const outgoing = useMemo(() => {
    if (!preview) return new Set();
    const out = new Set(preview.removed);
    preview.moved.forEach((m) => { if (termKey(m.to) !== termKey(shownTerm)) out.add(m.id); });
    return out;
  }, [preview, shownTerm]);

  const ghostIds = ghostRows.map((r) => r.id);
  const details = useCourseDetails([...ids, ...ghostIds]);
  const colours = courseColours([...ids, ...ghostIds]);
  const schedule = report?.schedule || {};
  const showTimes = schedule.published !== false;
  const blocks = useMemo(() => schedule.blocks || [], [schedule.blocks]);
  const clashSet = clashIdsOf(report?.clashes);
  const blocksOf = (id) => blocks.filter((b) => b.course === id);
  const ghostBlocksIn = preview ? (proposal.diff.schedule?.blocks_in || proposal.diff.schedule?.blocks || []) : [];
  const ghostBlocksOut = preview ? (proposal.diff.schedule?.blocks_out || []) : [];

  const signature = useMemo(() => signatureOf(rows, planCourses), [rows, planCourses]);
  const flash = useChangeFlash(signature, !!view);

  // ---- edits -------------------------------------------------------------
  const undo = useCallback(() => {
    if (!planner?.canUndo) return;
    planner.undo().catch((error) => {
      if (error?.held || error?.code === 'session_ended') return;
      const info = plannerError(error);
      toast.failed({ message: info.kind === 'refused' && info.reason ? info.reason : 'Couldn’t undo' });
    });
  }, [planner, toast]);

  const redo = useCallback(() => {
    if (!planner?.canRedo) return;
    planner.redo().catch((error) => {
      if (error?.held || error?.code === 'session_ended') return;
      const info = plannerError(error);
      toast.failed({ message: info.kind === 'refused' && info.reason ? info.reason : 'Couldn’t redo' });
    });
  }, [planner, toast]);

  // A failed save shows "Couldn't save · Retry" from the queue state (D8).
  const runEdit = useCallback((ops, message) => planner.edit(ops, {
    onSaved: () => toast.done(message, { onUndo: () => planner.undo().catch(() => {}) }),
  }).catch(() => null), [planner, toast]);

  const addCourse = useCallback((item, sections = null) => {
    if (!planner || !plan) return null;
    if (ids.includes(item.id)) {
      pulse(item.id);
      return null;
    }
    const elsewhere = (plan.courses || []).find((c) => c.id === item.id);
    const op = elsewhere
      ? { op: 'move', course: item.id, to_term: shownTerm }
      : { op: 'add', course: item.id, term: shownTerm };
    if (sections) op.sections = sections;
    return runEdit([op], `${elsewhere ? 'Moved' : 'Added'} to ${shownTerm}`);
  }, [planner, plan, ids, pulse, shownTerm, runEdit]);

  const dropOnWeek = useCallback(async (item) => {
    if (ids.includes(item.id)) {
      pulse(item.id);
      return;
    }
    const summary = await loadCourseSummary(authToken, item.id);
    const pick = fittingPick(summary?.sections?.rows || [], blocks, item.id);
    if (pick.sections) {
      addCourse(item, pick.sections);
      return;
    }
    addCourse(item);
    if (pick.choose) setSwap(item.id);
  }, [ids, pulse, authToken, blocks, addCourse]);

  const listTarget = useDropTarget({
    id: 'semester-list',
    label: `Courses in ${shownTerm}`,
    accepts: ['course'],
    onDrop: (item) => addCourse(item),
  });
  const weekTarget = useWeekTarget(dropOnWeek);

  // D8: hovering a drop target previews the credits ("13 → 16").
  const dragged = active?.data?.current?.item;
  const hoverId = (listTarget.over || weekTarget.over) && dragged?.type === 'course' && !ids.includes(dragged.id)
    ? dragged.id
    : null;
  const requestPreview = planner?.preview;
  useEffect(() => {
    if (!hoverId || !requestPreview) {
      setHoverCredits(null);
      return undefined;
    }
    let alive = true;
    requestPreview([{ op: 'add', course: hoverId, term: shownTerm }], shownTerm)
      .then((data) => {
        const after = data?.diff?.credits?.after;
        if (alive && after) setHoverCredits({ min: after[0], max: after[1] });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [hoverId, requestPreview, shownTerm]);

  const removeCourse = (id) => runEdit([{ op: 'remove', course: id }], `Removed from ${shownTerm}`);
  const moveCourse = (id, to) => runEdit([{ op: 'move', course: id, to_term: to }], `Moved to ${to}`);
  const pickSection = (id, sections) => runEdit([{ op: 'pick_section', course: id, sections }], 'Section changed');

  // Swap section reads the course's sections, even before its card has them.
  useEffect(() => {
    setSwapSummary(null);
    if (!swap) return undefined;
    let alive = true;
    loadCourseSummary(authToken, swap).then((summary) => {
      if (alive) setSwapSummary({ id: swap, summary });
    });
    return () => { alive = false; };
  }, [swap, authToken]);

  // ---- search ------------------------------------------------------------
  useEffect(() => {
    if (!search.open) return undefined;
    let alive = true;
    const q = query.trim();
    setSearch((current) => ({ ...current, status: 'loading' }));
    const timer = setTimeout(() => {
      const run = q
        ? searchCatalog(authToken, { q, limit: SEARCH_LIMIT })
        : getCatalogStarters(authToken);
      run.then((data) => {
        if (alive) setSearch((current) => ({ ...current, status: 'ready', results: (data?.courses || []).slice(0, SEARCH_LIMIT) }));
      }, () => {
        if (alive) setSearch((current) => ({ ...current, status: 'error', results: [] }));
      });
    }, q ? SEARCH_DELAY : 0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [search.open, query, authToken, searchRun]);

  const openSearch = () => {
    setSearch((current) => ({ ...current, open: true }));
    searchRef.current?.focus();
  };
  const closeSearch = () => setSearch({ open: false, status: 'idle', results: [] });

  // ---- render ------------------------------------------------------------
  if (!planner) return null;

  const termParams = (target) => {
    const next = new URLSearchParams(params);
    next.set('term', target);
    return `?${next.toString()}`;
  };
  const previous = shiftTerm(shownTerm, -1);
  const following = shiftTerm(shownTerm, 1);

  const onKeyDown = (event) => {
    const tag = event.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo(); else undo();
    }
  };

  const header = (
    <header className="sv-head">
      <nav className="sv-crumb" aria-label="Breadcrumb">
        <Link className="sv-back" to="?view=degree">
          <span aria-hidden="true">‹ </span>
          My degree
        </Link>
        <span className="sv-sep" aria-hidden="true">/</span>
        <h1 className="sv-term">{shownTerm}</h1>
        <span className="sv-termnav">
          {previous && (
            <Link className="sv-icon-btn" to={termParams(previous)} aria-label={`Previous term, ${previous}`} title={previous}>
              <ChevronLeftRounded aria-hidden="true" />
            </Link>
          )}
          {following && (
            <Link className="sv-icon-btn" to={termParams(following)} aria-label={`Next term, ${following}`} title={following}>
              <ChevronRightRounded aria-hidden="true" />
            </Link>
          )}
        </span>
      </nav>
      <span className="sv-undo">
        <button
          type="button"
          className="sv-icon-btn is-boxed"
          aria-label={planner.undoLabel || 'Undo'}
          title={planner.undoLabel || 'Undo'}
          disabled={!planner.canUndo}
          onClick={undo}
        >
          <UndoRounded aria-hidden="true" />
        </button>
        <button
          type="button"
          className="sv-icon-btn is-boxed"
          aria-label={planner.redoLabel || 'Redo'}
          title={planner.redoLabel || 'Redo'}
          disabled={!planner.canRedo}
          onClick={redo}
        >
          <RedoRounded aria-hidden="true" />
        </button>
      </span>
    </header>
  );

  const notices = (
    <>
      {planner.notice === 'conflict' && (
        <p className="sv-notice" role="status">
          Updated from another window
          <span aria-hidden="true"> · </span>
          <button type="button" className="sv-link" onClick={planner.dismissNotice}>Dismiss</button>
        </p>
      )}
      {planner.queueState === 'error' && (
        <p className="sv-notice is-error" role="alert">
          Couldn&apos;t save
          <span aria-hidden="true"> · </span>
          <button type="button" className="sv-link" onClick={planner.retry}>Retry</button>
        </p>
      )}
    </>
  );

  let body;
  if (!view && (loadFailed || (planner.status === 'error' && !planner.view))) {
    body = (
      <LoadError onRetry={() => (loadFailed
        ? planner.reloadTerm(term).catch(() => {})
        : planner.load().catch(() => {}))}
      />
    );
  } else if (!view) {
    body = <Skeleton />;
  } else {
    const credits = report?.credits || { min: 0, max: 0, limits: null };
    const empty = rows.length === 0;
    const creditsAfter = hoverCredits
      || (preview?.credits?.after ? { min: preview.credits.after[0], max: preview.credits.after[1] } : null);
    const counts = { harder: 0, typical: 0, easier: 0 };
    rows.forEach((row) => {
      const level = difficultyOf(row.harder, details[row.id]?.summary?.grades?.gpa);
      if (level) counts[level] += 1;
    });
    const creditsOf = (id) => rows.find((r) => r.id === id)?.credits?.[0];
    const gains = ruleGains(report?.rules, ids, creditsOf);
    const totalText = creditSpan([credits.min, credits.max]) ?? '0';
    const boardTerms = (planner.degree?.terms || []).map((t) => t.term);
    const moveTerms = moveTargets(shownTerm, boardTerms);
    const swapDetail = swapSummary?.id === swap ? swapSummary.summary : null;

    body = (
      <div className="sv-body">
        <div className="sv-side">
          <CreditsGauge
            credits={empty ? { ...credits, min: 0, max: 0 } : credits}
            after={creditsAfter}
            flash={flash.totals}
            chips={!empty && (
              <div className="sv-cbar" aria-hidden="true">
                {rows.map((row) => (
                  <i key={row.id} style={{ flex: row.credits?.[0] || 1 }}>
                    {row.id.split(' ')[0]} {row.credits?.[0] ?? ''}
                  </i>
                ))}
              </div>
            )}
          />
          {!empty && report?.difficulty?.label && (
            <LoadGauge
              difficulty={report.difficulty}
              counts={counts}
              after={preview?.difficulty?.after || null}
              flash={flash.totals}
            />
          )}
          <RequirementsTile rows={gains} changes={preview?.rules} flash={flash.totals} />
        </div>

        <div className="sv-main">
          <section
            ref={listTarget.ref}
            className={`sv-tile sv-courses ${listTarget.className}`}
            aria-labelledby="sv-courses-h"
          >
            <div className="sv-courses-head">
              <h2 id="sv-courses-h">Courses</h2>
              {!empty && (
                <span className="sv-courses-count">
                  {rows.length} {rows.length === 1 ? 'course' : 'courses'} · {totalText} credits
                </span>
              )}
              <span className="sv-courses-tools">
                <label className="sv-search">
                  <SearchRounded aria-hidden="true" />
                  <span className="sr-only">Search courses</span>
                  <input
                    ref={searchRef}
                    type="search"
                    value={query}
                    placeholder="Search courses"
                    onFocus={() => setSearch((current) => (current.open ? current : { ...current, open: true }))}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setSearch((current) => ({ ...current, open: true }));
                    }}
                    onKeyDown={(event) => { if (event.key === 'Escape') closeSearch(); }}
                  />
                </label>
                <button type="button" className="sv-btn" onClick={openSearch}>
                  <AddRounded aria-hidden="true" />
                  Add course
                </button>
              </span>
            </div>

            {touches && <PendingChange proposal={proposal} planner={planner} onAccept={acceptProposal} />}

            {search.open && (
              <SearchResults
                status={search.status}
                results={search.results}
                plannedIn={(id) => (ids.includes(id) ? `In ${shownTerm}` : null)}
                onAdd={(course) => addCourse({ type: 'course', id: course.identifier, title: course.title })}
                onClose={closeSearch}
                onRetry={() => setSearchRun((n) => n + 1)}
              />
            )}

            {(rows.length > 0 || ghostRows.length > 0) && (
              <div className="sv-cards">
                {rows.map((row) => (
                  <CourseCard
                    key={row.id}
                    course={row}
                    colour={colours.get(row.id)}
                    detail={details[row.id]}
                    blocks={blocksOf(row.id)}
                    chosen={planCourses.find((c) => c.id === row.id)?.sections || null}
                    showTimes={showTimes}
                    clash={clashSet.has(row.id)}
                    ghost={outgoing.has(row.id) ? 'out' : null}
                    flash={flash.ids.has(row.id)}
                    pulse={pulseId === row.id}
                    lit={lit === row.id}
                    moveTerms={moveTerms}
                    onHighlight={setLit}
                    onMove={moveCourse}
                    onSwap={setSwap}
                    onRemove={removeCourse}
                  />
                ))}
                {ghostRows.map((row) => (
                  <CourseCard
                    key={`ghost-${row.id}`}
                    course={row}
                    colour={colours.get(row.id)}
                    detail={details[row.id]}
                    blocks={ghostBlocksIn.filter((b) => b.course === row.id)}
                    showTimes={showTimes}
                    ghost="in"
                  />
                ))}
              </div>
            )}
          </section>

          {showTimes && (rows.length > 0 || ghostRows.length > 0) && (
            <WeekTile
              blocks={blocks}
              ghostIn={ghostBlocksIn}
              ghostOut={ghostBlocksOut}
              colours={colours}
              lit={lit}
              clashIds={clashSet}
              target={weekTarget}
              flash={flash.totals}
            />
          )}
        </div>

        {swap && (
          <SwapSectionDialog
            course={swap}
            rows={swapDetail?.sections?.rows || []}
            loading={swapSummary?.id !== swap}
            blocks={blocks}
            chosen={planCourses.find((c) => c.id === swap)?.sections || null}
            onClose={() => setSwap(null)}
            onApply={(sections) => {
              const id = swap;
              setSwap(null);
              pickSection(id, sections);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="semester-view" role="region" aria-label={shownTerm} onKeyDown={onKeyDown}>
      {header}
      {notices}
      {body}
    </div>
  );
}
