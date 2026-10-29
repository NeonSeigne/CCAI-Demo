import fs from 'fs';
import path from 'path';

// N2c: the cards carry their own stylesheet, so they stay styled once the
// plan panel (and PlanPanel.css) is gone.
const read = (...parts) => fs.readFileSync(path.join(__dirname, ...parts), 'utf8');

test.each(['ProposalCard.js', 'CourseShortlistCard.js'])('%s imports PlanCards.css, not PlanPanel.css', (file) => {
  const source = read(file);
  expect(source).toContain("import '../../styles/PlanCards.css';");
  expect(source).not.toContain('PlanPanel.css');
});

test('PlanCards.css holds the card rules and the controls they use; PlanPanel.css keeps only its own', () => {
  const cards = read('..', '..', 'styles', 'PlanCards.css');
  const panel = read('..', '..', 'styles', 'PlanPanel.css');
  ['.proposal-card {', '.pc-row {', '.pc-actions', '.shortlist-card', '.sl-row {', '.pp-btn {', '.pp-link {', '.pp-chip {', '.pp-skel {']
    .forEach((rule) => {
      expect(cards).toContain(rule);
      expect(panel).not.toContain(rule);
    });
  expect(panel).toContain('.plan-panel {');
  expect(cards).not.toContain('.plan-panel');
});
