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
- [economics.virginia.edu](https://economics.virginia.edu/overview-major);
- the MAE curriculum sheet for students graduating 2029 (PDF dated 10/29/2025), opened in a browser by a person and read from the download, because its URL is behind the Cloudflare challenge.

## Program files

All in `schools/<school>/programs/`. Each was drafted from its source, then checked line by line against the page text in a separate pass. Every file still says it needs a human check before the demo.

| School | Economics | Mathematics | Biology | Computer Science | Mechanical Engineering |
|---|---|---|---|---|---|
| UW–Madison | B.A. | B.S. | B.S. (L&S) | B.S. | B.S., 128 cr |
| CU Boulder | B.A. | B.A., Comprehensive track | Ecology & Evolutionary Biology B.A. | B.S. | B.S., 128 cr |
| UVA | B.A. | B.A., General Option | B.A. | B.S. (Engineering) | B.S., 131 cr (class of 2029 sheet) |

UVA also has the Batten School's Master of Public Policy (`mpp.yaml`, type `graduate`, 49 credits), from [its program page](https://batten.virginia.edu/programs/graduate-programs/mpp/): the 11 core courses are rules; the Foundation Skills Workshop, 15 elective credits and the summer internship are notes.

- **UW and CU:** total credits are set (120, or 128 for engineering).
- **UVA:** only Mechanical Engineering (131) and the MPP (49) set total credits. The other UVA files don't, because no readable source states the degree total, so their credit grid has no "Other credit" block.

## Open items before the demo

- **UVA Mechanical Engineering:** built from the sheet for students graduating 2029 (entered Fall 2025); no 2026-entry sheet was found. Its math-science/technical elective list is on the department website and wasn't read.
- **UVA Mathematics:** compare with the live 2026-27 Record page; the file was built from the 2025-26 copy.
- **Human check:** every file is marked as needing a check against its official page.
- **Rules the format can't express**, kept in notes for now:
  - "at most one of these" (CU CS core numerical slot, UW CS 536 or 538);
  - credit amounts encoded as course counts (CU ECON and EBIO 4000-level, CU and UW ME technical electives, UVA Biology and CS electives);
  - the C- exception for two courses (UVA Math);
  - UW `PATH-BIO 307`, because the loader rejects hyphenated subjects;
  - gen-ed requirements at all three schools (in `TODOS.md`).
- **Single program per major:** Math options and tracks other than the one encoded, and UW Biology's Evolutionary Biology option, are only in notes.
