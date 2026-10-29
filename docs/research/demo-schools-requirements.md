# Program requirements for the demo schools

Where the requirements for UW–Madison, CU Boulder and UVA come from, what each program file covers, and what is left before the demo. Checked 2026-10-29. The national expansion research and plan live on `feat/degree-planner-expander`.

## Sources

| School | Catalog | Platform | Automated access |
|---|---|---|---|
| UW–Madison | [guide.wisc.edu](https://guide.wisc.edu/) | CourseLeaf | Public; program pages read as text. robots.txt disallows `/ribbit/` and `/search/`. |
| CU Boulder | [catalog.colorado.edu](https://catalog.colorado.edu/) | CourseLeaf | Public. CS and ME URLs redirect to `-bscs/` and `-bsme/`. |
| UVA | [Undergraduate Record](https://records.ureg.virginia.edu/) | Modern Campus Catalog (Acalog) | Blocked: AWS WAF challenge. `engineering.virginia.edu` is blocked by Cloudflare. |

UVA sources used instead, all public:

- [bio.as.virginia.edu](https://bio.as.virginia.edu/undergraduate-program) and its 2026-27 Biology B.A. checklist PDF;
- [uvacsadvising.org](https://uvacsadvising.org/bscs.html) (CS B.S. page, checklist PDF, course list);
- a 2025-26 copy of the Record's Mathematics B.A. page in the math department's public repo, [uva-math/uva-math-code](https://github.com/uva-math/uva-math-code);
- [economics.virginia.edu](https://economics.virginia.edu/overview-major).

## Program files

All in `schools/<school>/programs/`. Each was drafted from its source, then checked line by line against the page text in a separate pass. Every file still says it needs a human check before the demo.

| School | Economics | Mathematics | Biology | Computer Science | Mechanical Engineering |
|---|---|---|---|---|---|
| UW–Madison | B.A. | B.S. | B.S. (L&S) | B.S. | B.S., 128 cr |
| CU Boulder | B.A. | B.A., Comprehensive track | Ecology & Evolutionary Biology B.A. | B.S. | B.S., 128 cr |
| UVA | B.A. | B.A., General Option | B.A. | B.S. (Engineering) | **B.S., partial** |

- **UW and CU:** total credits are set (120, or 128 for engineering).
- **UVA:** no file sets total credits, because no readable source states the degree total. The credit grid has no "Other credit" block there.

## Open items before the demo

- **UVA Mechanical Engineering:** only the general engineering requirements are encoded (calculus, chemistry, physics, engineering foundations, STS). The ME core, design sequence and electives must be added by hand from the Record or the engineering site in a browser.
- **UVA Mathematics:** compare with the live 2026-27 Record page; the file was built from the 2025-26 copy.
- **Human check:** every file is marked as needing a check against its official page.
- **Rules the format can't express**, kept in notes for now:
  - "at most one of these" (CU CS core numerical slot, UW CS 536 or 538);
  - credit amounts encoded as course counts (CU ECON and EBIO 4000-level, CU and UW ME technical electives, UVA Biology and CS electives);
  - the C- exception for two courses (UVA Math);
  - UW `PATH-BIO 307`, because the loader rejects hyphenated subjects;
  - gen-ed requirements at all three schools (in `TODOS.md`).
- **Single program per major:** Math options and tracks other than the one encoded, and UW Biology's Evolutionary Biology option, are only in notes.
