import fs from 'fs';
import path from 'path';

// N2c: the cards carry their own stylesheet, so they stay styled once the
// plan panel (and PlanPanel.css) is gone. Since Home Colors that is the chat
// cards' CourseVisuals.css.
const read = (...parts) => fs.readFileSync(path.join(__dirname, ...parts), 'utf8');

test.each(['ProposalCard.js', 'CourseShortlistCard.js'])('%s imports CourseVisuals.css, not PlanPanel.css', (file) => {
  const source = read(file);
  expect(source).toContain("import '../../styles/CourseVisuals.css';");
  expect(source).not.toContain('PlanPanel.css');
});

test('CourseVisuals.css holds the card rules and the controls they use; the plan panel is gone (C1)', () => {
  const cards = read('..', '..', 'styles', 'CourseVisuals.css');
  ['.vc-card {', '.vc-diff li {', '.vc-foot {', '.vc-srow {', '.vc-btn {', '.vc-link {', '.vc-chip {', '.vc-skeleton']
    .forEach((rule) => expect(cards).toContain(rule));
  expect(cards).not.toContain('.plan-panel');
  ['styles/PlanPanel.css', 'components/planner/PlanPanel.js', 'components/planner/PlanSheet.js'].forEach((file) => {
    expect(fs.existsSync(path.join(__dirname, '..', '..', file))).toBe(false);
  });
});
