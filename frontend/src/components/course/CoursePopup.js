import React from 'react';
import { Icon } from '../icons';
import SaveButton from '../SaveButton';
import {
  CourseTiles, GradeBars, PrereqTags, SectionRows, useCourseFacts,
} from '../../modules/course';
import { isNotFound } from '../popup/PopupParts';
import { BandSheet, SheetActions, SheetBand } from '../../modules/sheet';
import '../../styles/CoursePopup.css';

/**
 * The course pop-up's body (DESIGN.md "Course card / pop-up",
 * course-popup.html; plan D1): one column. The band has the code and
 * credits, the title and up to three tiles, number above label: "Average
 * GPA · Typical", "Instructor rating" and "Seats open" (live seats only,
 * R8). Then Grades (bars grouped per school, R11 / Q13), Sections (code,
 * time, instructor, seat tag) and Prerequisites (code tags with the
 * student's states); then Add to plan, Compare and the bookmark. The frame
 * is the band sheet's (modules/sheet); the dialog is the shell's pop-up host.
 *
 * Anything the course lacks is left out (a tile, a section, a button);
 * a failed request shows the band sheet's error state with Retry.
 *
 * Props
 *   courseId                    the catalog identifier ("COMP SCI 400")
 *   term                        the plan's term: the instructor rating covers its sections (Q15)
 *   states                      {id: 'done' | 'now'}: the student's prerequisite states
 *   onAdd(id), onCompare(id), onClose()   a missing one hides its button
 *   onSave(item), saved         optional; without onSave the shared SaveButton is used
 *   onOpenCourse(id)            a prerequisite tag
 *   titleId                     id for the title, for the host's aria-labelledby
 */

const TILE_KEYS = ['gpa', 'rating', 'seats'];

function Section({ id, title, children }) {
  return (
    <section className="cp-block" aria-labelledby={id}>
      <h3 id={id} className="cp-block-title">{title}</h3>
      {children}
    </section>
  );
}

function Actions({
  id, title, onAdd, onCompare, onSave, saved,
}) {
  const item = { type: 'course', id, title: title || '' };
  return (
    <SheetActions>
      {onAdd && (
        <button type="button" className="pop-btn pop-btn--primary" onClick={() => onAdd(id)}>
          <Icon name="add" size={20} /> Add to plan
        </button>
      )}
      {onCompare && (
        <button type="button" className="pop-btn" onClick={() => onCompare(id, title)}>
          <Icon name="compare_arrows" size={20} /> Compare
        </button>
      )}
      {onSave ? (
        <button
          type="button"
          className="pop-btn pop-btn--icon"
          aria-label={saved ? `Saved ${id}` : `Save ${id}`}
          aria-pressed={Boolean(saved)}
          title={saved ? 'Saved' : 'Save'}
          onClick={() => onSave(item)}
        >
          <Icon name="bookmark" size={20} filled={Boolean(saved)} />
        </button>
      ) : (
        <SaveButton className="pop-save" item={{ kind: 'course', key: id, display_name: id }} />
      )}
    </SheetActions>
  );
}

export default function CoursePopup({
  courseId,
  term,
  states,
  onAdd,
  onCompare,
  onSave,
  saved,
  onClose,
  onOpenCourse,
  titleId = 'course-popup-title',
}) {
  const { facts, error, retry } = useCourseFacts(courseId, { ratings: true, term: term || undefined, states });
  const id = facts?.id || courseId;

  if (error) {
    const missing = isNotFound(error);
    return (
      <BandSheet
        kind="course"
        className="cp-sheet"
        titleId={titleId}
        status="error"
        error={missing ? { message: 'Course not found' } : { onRetry: retry }}
        band={<SheetBand eyebrow={courseId} title={courseId} titleId={titleId} onClose={onClose} />}
      />
    );
  }

  if (!facts) {
    return (
      <BandSheet
        kind="course"
        className="cp-sheet"
        titleId={titleId}
        status="loading"
        loadingLabel={`Loading ${courseId}`}
        band={<SheetBand eyebrow={courseId} titleId={titleId} titleLabel={courseId} onClose={onClose} tiles={3} />}
      >
        <span className="pnl-block cp-skel-bars" />
      </BandSheet>
    );
  }

  const eyebrow = [id, facts.credits ? `${facts.credits} credits` : null].filter(Boolean).join(' · ');
  const grades = facts.grades || facts.gradesAll;

  return (
    <BandSheet
      kind="course"
      className="cp-sheet"
      titleId={titleId}
      band={(
        <SheetBand eyebrow={eyebrow} title={facts.title || id} titleId={titleId} onClose={onClose}>
          <CourseTiles tiles={facts.tiles} keys={TILE_KEYS} />
        </SheetBand>
      )}
      actions={(
        <Actions
          id={id}
          title={facts.title}
          onAdd={onAdd}
          onCompare={onCompare}
          onSave={onSave}
          saved={saved}
        />
      )}
    >
      <div className="cp-column">
        {grades && (
          <Section id="cp-grades-title" title="Grades">
            <GradeBars groups={grades.groups} size="popup" label={`Grades for ${id}`} />
          </Section>
        )}
        {facts.sections && (
          <Section id="cp-sections-title" title="Sections">
            <SectionRows sections={facts.sections} variant="popup" label={`Sections of ${id}`} />
          </Section>
        )}
        {facts.prereqs.length > 0 && (
          <Section id="cp-prereqs-title" title="Prerequisites">
            <PrereqTags prereqs={facts.prereqs} onOpen={onOpenCourse} label={`Prerequisites for ${id}`} />
          </Section>
        )}
      </div>
    </BandSheet>
  );
}
