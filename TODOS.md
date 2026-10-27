# TODOS

## Design

### Write a DESIGN.md for Campus Companion

**What:** Record type scale, spacing, radii, colour roles and component rules in a DESIGN.md (run /design-consultation).

**Why:** The design system lives only in frontend/src/styles/brand-tokens.css plus per-page CSS, so each review has to rebuild contrast and token rules by hand.

**Context:** Raised by /plan-design-review on 2026-10-27 (docs/designs/campus-pages-plan.md, Pass 5 scored 8/10 for this reason). Start from decisions 23A-25A in that plan: coloured text uses the `--domain-*-ink` tokens, bright domain colours only for graphics; new `--focus-ring`, `--error-ink`, `--error-tint` and `--selection` tokens; every figure labelled with its own term or date. Keep it in sync with brand-tokens.css.

**Effort:** S
**Priority:** P2
**Depends on:** None

## Completed
