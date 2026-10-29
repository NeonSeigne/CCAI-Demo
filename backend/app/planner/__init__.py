"""Semester planner: a student's plan, checked by code, edited by proposals.

Design: docs/designs/semester-planner.md and docs/designs/tab-workspaces.md.
Modules, each owning one thing:

- ``facts``     course facts per term, fetched in one bounded batch
- ``programs``  hand-checked program files from the school pack
- ``checker``   every check behind ``check(plan, facts, programs) -> report``
- ``edits``     edit operations, proposals, undo, and the diff of two reports
- ``store``     Mongo persistence with a revision guard
- ``suggest``   interest-based course shortlists
- ``degree``    the multi-term degree board and its waffle groups
- ``roadmap``   term-by-term fill (M2)
"""
