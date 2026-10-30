import { creditSpan, ruleCount, ruleHave, statusWord } from './planFormat';

/**
 * Turn a proposal's diff into rows a person reads (design 2A): requirement
 * changes, credits, difficulty and clashes, biggest consequence first.
 *
 * Each row: {key, label, before, after, weight}. A rule whose status flips
 * (Met -> Short) outranks one whose count moves; a count move outranks
 * difficulty, which outranks credits and clashes that only shift.
 */

const sameSpan = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);

function ruleRow(rule) {
  const before = rule.before || {};
  const after = rule.after || {};
  const statusChanged = before.status !== after.status;
  const unit = rule.unit || (after.unit === 'credits' ? 'credits' : 'courses');
  let beforeText;
  let afterText;
  if (statusChanged && (before.status === 'unknown' || after.status === 'unknown')) {
    beforeText = statusWord(before.status);
    afterText = statusWord(after.status);
  } else {
    beforeText = `${ruleHave(before)}`;
    afterText = ruleCount(after, unit) || `${ruleHave(after)}`;
    if (statusChanged) {
      beforeText = `${statusWord(before.status)} · ${beforeText}`;
      afterText = `${statusWord(after.status)} · ${afterText}`;
    }
  }
  // A requirement that stops being met is the worst news; gaining one is next.
  let weight = 40;
  if (statusChanged && after.status === 'short') weight = 100;
  else if (statusChanged) weight = 90;
  else if (ruleHave(before) !== ruleHave(after)) weight = 60;
  return {
    key: `rule:${rule.program_id || ''}:${rule.rule_id}`,
    label: rule.title || rule.rule_id,
    before: beforeText,
    after: afterText,
    weight,
    ruleId: rule.rule_id,
  };
}

/** Every consequence row of `diff`, biggest first. */
export function consequenceRows(diff) {
  if (!diff) return [];
  const rows = (diff.rules || []).map(ruleRow);

  const credits = diff.credits || {};
  if (credits.before || credits.after) {
    rows.push({
      key: 'credits',
      label: 'Credits this term',
      before: creditSpan(credits.before) ?? 'unknown',
      after: creditSpan(credits.after) ?? 'unknown',
      weight: sameSpan(credits.before, credits.after) ? 10 : 30,
    });
  }

  const difficulty = diff.difficulty || {};
  if ((difficulty.before || difficulty.after) && difficulty.before !== difficulty.after) {
    rows.push({
      key: 'difficulty',
      label: 'Difficulty estimate',
      before: difficulty.before || 'unknown',
      after: difficulty.after || 'unknown',
      suffix: 'from past grades',
      weight: 50,
    });
  }

  const clashes = diff.clashes || {};
  if (clashes.before !== clashes.after && (clashes.before || clashes.after)) {
    rows.push({
      key: 'clashes',
      label: 'Clashes',
      before: clashes.before || 'unknown',
      after: clashes.after || 'unknown',
      weight: clashes.after === 'found' ? 95 : 20,
    });
  }

  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => b.row.weight - a.row.weight || a.index - b.index)
    .map(({ row }) => row);
}

const PREREQ_WORD = { met: 'Met', not_met: 'Not met', unknown: 'Unknown' };

/**
 * The proposed-change card's rows in the order design Q8 sets (chat-prereq):
 *
 *   1. the courses: a move ("ECON 4010 Game Theory", Fall 2027 → Spring 2027), an add, a remove
 *   2. "Not what you asked" with the difference (R10)
 *   3. problems: Prerequisites Not met, Clashes found
 *   4. credits per affected term (`diff.terms`; else the shown term's, when it moves)
 *   5. requirement and difficulty changes, biggest first
 *   6. Prerequisites Met, or Unknown
 *   7. one "?" row per thing the check couldn't settle
 *
 * Each row: {key, kind, icon, label, code?, title?, before?, after?, value?, note?}.
 * `kind` is 'course' | 'literal' | 'problem' | 'credits' | 'change' | 'ok' | 'unknown'.
 * A row with `before`/`after` reads as a change; otherwise `value` stands alone.
 */
export function proposalRows(diff) {
  if (!diff) return [];
  const rows = [];
  const courses = diff.courses || {};
  const added = new Map((diff.added_courses || []).map((c) => [c.id, c]));

  (courses.moved || []).forEach((m) => rows.push({
    key: `move:${m.id}`, kind: 'course', icon: 'swap_horiz', code: m.id, title: m.title || null, before: m.from, after: m.to,
  }));
  (courses.added || []).forEach((id) => rows.push({
    key: `add:${id}`, kind: 'course', icon: 'add', code: id, title: added.get(id)?.title || null, value: added.get(id)?.term || null,
  }));
  (courses.removed || []).forEach((id) => rows.push({
    key: `remove:${id}`, kind: 'course', icon: 'delete', code: id, value: 'Removed',
  }));

  if (diff.literal_differs) {
    rows.push({
      key: 'literal', kind: 'literal', icon: 'warning', label: 'Not what you asked', note: diff.literal_differs,
    });
  }

  const prereqs = diff.prereqs?.status;
  if (prereqs === 'not_met') {
    rows.push({
      key: 'prereqs', kind: 'problem', icon: 'close', label: 'Prerequisites', value: PREREQ_WORD.not_met,
    });
  }
  if (diff.clashes?.after === 'found') {
    rows.push({
      key: 'clashes', kind: 'problem', icon: 'close', label: 'Clashes', value: 'Found',
    });
  }

  const span = (side) => creditSpan(side ? [side.min, side.max] : null) ?? 'unknown';
  if ((diff.terms || []).length) {
    diff.terms.forEach((t) => {
      const before = span(t.before);
      const after = span(t.after);
      rows.push(before === after
        ? { key: `credits:${t.term}`, kind: 'credits', icon: 'functions', label: `${t.term} credits`, value: after }
        : {
          key: `credits:${t.term}`, kind: 'credits', icon: 'functions', label: `${t.term} credits`, before, after,
        });
    });
  } else if (diff.credits && !sameSpan(diff.credits.before, diff.credits.after)) {
    rows.push({
      key: 'credits',
      kind: 'credits',
      icon: 'functions',
      label: 'Credits this term',
      before: creditSpan(diff.credits.before) ?? 'unknown',
      after: creditSpan(diff.credits.after) ?? 'unknown',
    });
  }

  consequenceRows({ rules: diff.rules, difficulty: diff.difficulty })
    .forEach((row) => rows.push({
      key: row.key,
      kind: 'change',
      icon: row.key === 'difficulty' ? 'bar_chart' : 'school',
      label: row.label,
      before: row.before,
      after: row.after,
    }));

  if (prereqs === 'met' || prereqs === 'unknown') {
    rows.push({
      key: 'prereqs',
      kind: prereqs === 'met' ? 'ok' : 'unknown',
      icon: prereqs === 'met' ? 'check' : 'help',
      label: 'Prerequisites',
      value: PREREQ_WORD[prereqs],
    });
  }

  (diff.unknowns || []).forEach((text) => rows.push({
    key: `unknown:${text}`, kind: 'unknown', icon: 'help', label: text,
  }));
  return rows;
}

/** True when a proposal's rows include a problem (Not met, Clashes): Apply then turns secondary (Q8). */
export const hasProblem = (rows) => rows.some((row) => row.kind === 'problem');

const rowText = (row) => `${row.before ?? ''}|${row.after ?? ''}|${row.value ?? ''}|${row.note ?? ''}`;

/** Keys of rows whose values differ between two diffs (Needs review). */
export function changedRowKeys(oldDiff, newDiff) {
  const old = new Map(proposalRows(oldDiff).map((row) => [row.key, rowText(row)]));
  return new Set(
    proposalRows(newDiff)
      .filter((row) => old.get(row.key) !== rowText(row))
      .map((row) => row.key),
  );
}

/**
 * Ops for "Drop it instead" (11A): the proposal's own ops with every move
 * turned into the remove the student literally asked for.
 */
export function literalOps(proposal) {
  const ops = Array.isArray(proposal?.ops) ? proposal.ops : [];
  if (ops.length) {
    return ops.map((op) => (op.op === 'move' ? { op: 'remove', course: op.course } : op));
  }
  return (proposal?.diff?.courses?.moved || []).map((move) => ({ op: 'remove', course: move.id }));
}

/** The panel's view of a pending diff: what changes per course and rule. */
export function previewOf(proposal) {
  const diff = proposal?.diff;
  if (!diff) return null;
  const courses = diff.courses || {};
  return {
    added: new Set(courses.added || []),
    removed: new Set(courses.removed || []),
    moved: new Map((courses.moved || []).map((m) => [m.id, m])),
    rules: new Map((diff.rules || []).map((r) => [`${r.program_id || ''}:${r.rule_id}`, r])),
    credits: diff.credits || null,
    difficulty: diff.difficulty || null,
    clashes: diff.clashes || null,
  };
}
