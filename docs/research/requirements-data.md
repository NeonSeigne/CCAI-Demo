# Degree requirements at national scale

Research on 2026-10-29: where a degree planner can get the list of majors and the requirements of each major for US colleges, and how much of that can be automated.

Method: three read-only research passes (catalog software, other data sources, a 16-school sample), using public pages and documentation. No accounts, no API keys, no attempts to get around bot checks. Claims marked *unverified* come from secondary sources or summaries and weren't confirmed against a primary page.

## Findings

1. **Lists of majors are solved.** IPEDS and College Scorecard publish every program at every Title IV school, free.
2. **No national source publishes structured requirements.** Structured copies exist only inside each school's degree-audit system, which the school owns.
3. **Reachability depends on catalog software.** Four platforms serve requirements publicly; Acalog / Modern Campus, the largest, challenges automated requests on every program page.
4. **In a 16-school sample, 38 of 78 school–major pairs (49%) had readable requirement lists; 30 (38%) were blocked, 15 of them confirmed by a challenge and 15 inferred from the same host.** Open CourseLeaf catalogs were 25 of 25; Acalog catalogs 0 of 15; community colleges 0 of 10.
5. **Extraction needs a check pass.** Drafting rules from a page, then checking them against the page text with a separate pass, caught real errors in the first 15 program files.

## Majors lists

| Source | What it has | Access | Use |
|---|---|---|---|
| IPEDS Completions (`C2025_A`) | Awards by institution × 6-digit CIP × award level, July 2024–June 2025 | Free CSV, no key ([NCES data files](https://nces.ed.gov/ipeds/datacenter/DataFiles.aspx)) | Majors list per school |
| College Scorecard field of study | Institution × 4-digit CIP × credential, with earnings and debt; updated 2026-06-10 | Free bulk CSV; API needs a free api.data.gov key, 1,000 requests/hour ([docs](https://collegescorecard.ed.gov/data/api-documentation/)) | Coarser alternative to IPEDS |
| CIP 2020 taxonomy | Field-of-study codes with 2010→2020 and CIP→SOC crosswalks | Free ([NCES](https://nces.ed.gov/ipeds/cipcode/)) | Key for programs in our data |

Limits: rows are CIP codes, not the school's own major names, and one CIP can cover several majors. IPEDS reflects awards conferred, so new programs appear late. Whether programs with zero awards appear is unverified.

## Requirements: catalog platforms

| Platform | Schools (est.) | Access | Structure | Fingerprint |
|---|---|---|---|---|
| Modern Campus Catalog (Acalog) | 800+ ([vendor](https://moderncampus.com/products/catalog-management.html)); 42% of the catalog market in 2022 ([ListEdTech](https://www.listedtech.com/blog/catalog-management-a-new-product-category/)) | Home page loads; every deeper page returns `202` with `x-amzn-waf-action: challenge` (Purdue, UNLV, CSULB, Georgia Southern, NC A&T, UVA). API at `<school>.apis.acalog.com` needs a key each school issues ([example integration](https://docs.squiz.net/funnelback/docs/latest/reference/plugins/released/acalog-basic_1.0.0.html)). robots.txt asks for `crawl-delay: 120`. | HTML blocks of course links; "choose N" rules mostly prose (*unverified*: program pages couldn't be read) | `preview_program.php?catoid=&poid=`, `acalog-` classes, `Server: director` |
| Leepfrog CourseLeaf | 500+ across all CourseLeaf products ([Leepfrog](https://www.leepfrog.com/about/)); 25% of the catalog market in 2022 | Public HTML; per-program PDF exports. robots.txt disallows `/ribbit/` and `/search/`. Some schools put it behind a firewall (NOVA). | Good: `table.sc_courselist` with or-rows (`orclass`), area headers, course codes and credits. "N credits from" is usually a prose comment row. | `courseleaf.css`, `sc_courselist`, `/ribbit/` in robots.txt |
| Coursedog | 300+ across all Coursedog products ([Coursedog](https://coursedog.com/clients/courseleaf)) | Public server-rendered pages; sitemap lists programs (Utah: 552); robots.txt `Allow: /` | Best: each page embeds `__NUXT_DATA__` JSON with rule trees (`completedAllOf`, course groups). Course references are internal IDs to resolve. | Nuxt (`_nuxt/`), `app.coursedog.com` |
| Kuali Catalog | Unknown (third-party estimates conflict) | Public JSON at `https://<school>.kuali.co/api/v1/catalog/...` (`/public/catalogs/current`, `/programs/<catalogId>`, `/program/<catalogId>/<pid>`), verified at UNM | Good: `degreeRequirements` is HTML from the rule builder ("Complete all of the following") | `<school>.kuali.co`, `kuali-catalog` element |
| Watermark (formerly SmartCatalog IQ) | 16% of the catalog market in 2022 | Public HTML on `smartcatalogiq.com` or a custom domain; navigation JSON at `/Institutions/<School>/json/<year>/Catalog.json` | Fairly good: `sc-programtable-*` columns (number, title, credits), required-course headings, total credits | `smartcatalogiq.com`, `sc-` classes |
| Clean Catalog, Acadea, eLumen | Unknown | Unverified | Unverified | Unverified |

ListEdTech tracks 1,907 institutions with a catalog system ([ListEdTech](https://listedtech.com/?p=15693)); NCES counts 5,819 Title IV institutions in 2023–24, about 2,690 of them four-year.

Platforms change: K-State moved from Acalog to Coursedog. A crawler has to re-detect each school's platform and pin the catalog year.

## Requirements: other sources

| Source | What it has | Access | Use |
|---|---|---|---|
| Degree Works (Ellucian) | Requirements as Scribe "requirement blocks" | Inside each school only; no public API found (*unverified*) | Structured, but school-owned |
| uAchieve / DARS (CollegeSource) | Requirements encoded by registrar staff | Inside each school; students can run their own audit as PDF | Same |
| Stellic | Structured audits; staff bulk-export API; audit export as PDF or CSV | Staff-facing | Same |
| CUNY Transfer Explorer (T-Rex) | Program requirements for CUNY colleges, parsed from Degree Works blocks ([help](https://explorer.cuny.edu/help)); code under github.com/cvickery (BSD-3) | Public site | Precedent: audit data turned into public requirements |
| CollegeSource Online | ~169,000 catalogs from ~7,500 institutions (PDF and HTML) | Library or institution subscription; no API or data license found | Historical catalog years |
| Transferology / TES | 6M+ course equivalencies | Institutions pay; no third-party license found | Transfer features only |
| ASSIST (California) | Transferable-course and GE lists; major-prep agreements on the site | Extracts limited to CA staff; API "planned" ([ASSIST](https://resource.assist.org/Data)) | Not usable now |
| Florida Common Prerequisites Manual | Prerequisite courses per major at every public college and university | Searchable on FloridaShines; no bulk download found | Lower-division only |
| Texas TCCNS, ACGM, Fields of Study | Common course numbers and lower-division blocks | Public downloads ([TCCNS](https://tccns.org/export/archive/yearid:2)) | Texas course normalization |
| SUNY Transfer Paths, Transfer Virginia | Shared lower-division paths; transfer guides | Web pages; Transfer Virginia returned 403 | Low |
| Credential Engine Registry (CTDL) | Credentials with condition profiles; schools publish voluntarily | Open registry; Search API and commercial use need a developer agreement ([guidance](https://guidance.credentialengine.org/?p=2311)) | Small supplement; requirement detail likely thin (*unverified*) |
| BigFuture, Peterson's | Majors offered, self-reported | No public API found | Display names only |
| 1EdTech CASE and CLR, PESC, Ed-Fi | Competencies, transcripts, course inventory, K-12 plans | Public standards | None describes program requirements |

Prior work: KnowPlan ([arXiv 2608.06530](https://arxiv.org/abs/2608.06530), August 2026) reports LLM extraction from 100 universities' catalogs into a typed requirement graph checked by a constraint solver, with 96.2% inventory recall; it keeps extraction and planning separate. No code release stated. Single-school scrapers exist (UW, UCI, Stanford), mostly for prerequisites; no maintained multi-school requirements dataset was found.

## 16-school sample

One request per page with plain curl and a User-Agent naming the repo, 2–4 s apart, from one IP. "Blocked" means an AWS WAF challenge (`202`, `x-amzn-waf-action: challenge`) or a Cloudflare challenge (`403`, "Just a moment..."). Full rows: [requirements-sample-2026-10-29.csv](requirements-sample-2026-10-29.csv).

| School | Type | Platform | Readable | Difficulty |
|---|---|---|---|---|
| UT Austin | Flagship | CourseLeaf | 5/5 | Easy |
| Florida | Flagship | CourseLeaf | 5/5 | Easy |
| Ohio State | Flagship | Unknown, AWS WAF | 0/5 | Blocked |
| Michigan | Flagship | Custom, Cloudflare | 0/5 | Blocked |
| Georgia Tech | Tech | CourseLeaf | 5/5 | Easy |
| Cal State Long Beach | Regional | Acalog | 0/5 | Blocked |
| SUNY New Paltz | Regional | CourseLeaf | 5/5 | Easy |
| Georgia Southern | Regional | Acalog | 0/5 | Blocked |
| NC A&T | HBCU | Acalog | 0/5 | Blocked |
| Howard | HBCU | PDF only | 4/5 | Medium |
| Duke | Private research | Coursedog | 5/5 | Medium |
| Northwestern | Private research | CourseLeaf | 5/5 | Easy |
| Williams | Liberal arts | Unknown, Cloudflare | 0/4 | Blocked |
| Carleton | Liberal arts | Custom WordPress | 4/4 | Medium |
| Miami Dade College | Community college | CurriQunet META (JS only) | 0/5 | No course lists |
| Northern Virginia CC | Community college | CourseLeaf, AWS WAF | 0/5 | Blocked |

Totals:

- **All pairs:** 78 offered (Williams and Carleton have no Mechanical Engineering); 38 readable, 30 blocked (15 confirmed, 15 inferred), the rest without course lists or not found.
- **By platform:** open CourseLeaf 25/25; Coursedog 5/5; WordPress 4/4; PDF 4/5; Acalog 0/15; firewalled custom or CourseLeaf 0/19; JS-only 0/5.
- **By school type:** tech 5/5, private research 10/10, flagship 10/20, liberal arts 4/8, HBCU 4/10, regional 5/15, community college 0/10.

Department pages and checklist PDFs (CSULB, Howard, Ohio State) were often readable when the catalog wasn't, but they're unofficial and can lag the catalog.

Limits: single requests from one IP on one day; some blocks inferred from other pages on the same host; difficulty judged from one page each.

## First 15 program files

The UVA, UW–Madison and CU Boulder files in `schools/*/programs/` showed:

- **Bot challenges:** UVA's Undergraduate Record (Acalog) and engineering site block automated requests, so UVA Mechanical Engineering has the general engineering requirements only.
- **Summaries aren't enough:** fetch tools that summarise pages paraphrase course tables; reading the page text directly was needed.
- **Format gaps:** the rule kinds can't express "at most one of these", credit-based level rules (encoded as course counts), subject codes with hyphens (UW `PATH-BIO`) or gen-ed rules.

## Recommendation

Cover every major in tiers rather than by crawling alone.

| Tier | Source | Coverage |
|---|---|---|
| All schools | IPEDS majors list by CIP | Every Title IV school; students can pick a major everywhere |
| 1. Automatic | Parsers for CourseLeaf, Coursedog, Kuali, Watermark, each followed by a check pass against the page text | Estimated 35–50% of four-year schools, weighted toward large universities |
| 2. Student-supplied | Upload of the student's own degree-audit PDF (Degree Works, DARS, Stellic); keep the requirement structure, drop grades and identifiers | Any school, including blocked ones, for that student's major and catalog year |
| 3. Partnerships | School-issued Acalog API keys, data feeds, or permission for firewalled catalogs | The 800+ Acalog schools and blocked flagships |

Constraints:

- **No bot-check workarounds:** blocked schools wait for tier 2 or 3, including headless browsers that solve challenges.
- **robots.txt:** crawlers follow robots.txt and crawl delays.
- **Undocumented endpoints:** the Coursedog and Kuali JSON endpoints are undocumented and can change; use at scale with each school's agreement.
- **Student uploads:** audit PDFs carry personal data (grades, student ID, GPA). They need parse-and-discard handling and a privacy review. FERPA binds schools, not a student sharing their own record; this is not legal advice.

Program file changes needed before scaling:

- an "at most one of these" rule;
- credit-based level rules;
- hyphenated subjects;
- a gen-ed rule kind (already in `TODOS.md`);
- `cip` code;
- `source_platform`;
- catalog year as the school states it;
- a review status.
