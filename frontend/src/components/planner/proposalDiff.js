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

/** Keys of rows whose before/after differ between two diffs (Needs review). */
export function changedRowKeys(oldDiff, newDiff) {
  const old = new Map(consequenceRows(oldDiff).map((row) => [row.key, `${row.before}|${row.after}`]));
  return new Set(
    consequenceRows(newDiff)
      .filter((row) => old.get(row.key) !== `${row.before}|${row.after}`)
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
