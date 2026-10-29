# Degree requirements at national scale

Research on 2026-10-29: where a degree planner can get the list of majors and the requirements of each major for US colleges, and how much of that can be automated.

Method: three read-only research passes (catalog software, other data sources, a 16-school sample), using public pages and documentation. No accounts, no API keys, no attempts to get around bot checks. Claims marked *unverified* come from secondary sources or summaries and weren't confirmed against a primary page. On 2026-10-29 Outside review fact-checked the doc against primary sources and recounted the CSV; its corrections are applied below.

## Findings

1. **A national baseline of programs exists.** IPEDS and College Scorecard publish programs by CIP code and award level for every Title IV school, free. They don't give the school's own major names, tracks or concentrations, so they need reconciling with each catalog.
2. **No comprehensive national source of structured requirements was found.** Structured requirements exist in schools' degree-audit systems (school-owned), in some catalog platforms' public data (Coursedog, Kuali), and in CUNY's public Scribe-derived requirements.
3. **Reachability depends on catalog software.** Four platforms serve requirements publicly. Acalog / Modern Campus, the largest, challenged automated requests on every program page requested at the six Acalog schools tried; that isn't proof of a platform-wide rule.
4. **In a 16-school sample of 78 candidate school–major pairs, 38 (49%) had a readable catalog or official PDF requirement list and 34 sat on blocked catalog hosts (15 rows with a challenge seen, 19 inferred).** Open CourseLeaf catalogs were 25 of 25; Acalog catalogs 0 of 15; community colleges 0 of 10. Readable isn't the same as complete: Duke Biology keeps some elective lists only in its degree-audit system.
5. **Extraction needs a check pass.** Drafting rules from a page, then checking them against the page text with a separate pass, caught errors in the first 15 program files (two CU notes and three UVA Biology items).

## Majors lists

| Source | What it has | Access | Use |
|---|---|---|---|
| IPEDS Completions (`C2025_A`) | Awards by institution × 6-digit CIP × award level, July 2024–June 2025 | Free CSV, no key ([NCES data files](https://nces.ed.gov/ipeds/datacenter/DataFiles.aspx)) | Program baseline per school |
| College Scorecard field of study | Institution × 4-digit CIP × credential, with earnings and debt ([documentation](https://collegescorecard.ed.gov/assets/FieldOfStudyDataDocumentation.pdf)); 2026-06-10 update date *unverified* | Free bulk CSV; API needs a free api.data.gov key; api.data.gov's default limit is 1,000 requests/hour per key ([api.data.gov](https://api.data.gov/docs/developer-manual/)); Scorecard's own API page returned 403 | Coarser alternative to IPEDS |
| CIP 2020 taxonomy | Field-of-study codes with 2010→2020 and CIP 2020→SOC 2018 crosswalks | Free ([NCES](https://nces.ed.gov/ipeds/cipcode/)) | Key for programs in our data |

Limits: rows are CIP codes, not the school's own major names, and one CIP can cover several majors. IPEDS asks schools to report offered programs even with zero completions ([NCES instructions](https://nces.ed.gov/Ipeds/use-the-data/download-survey-material/2012/completions/c_2012.pdf)), but reporting is annual, so new programs appear a year or more late.

## Requirements: catalog platforms

| Platform | Schools (est.) | Access | Structure | Fingerprint |
|---|---|---|---|---|
| Modern Campus Catalog (Acalog) | 800+ ([vendor](https://moderncampus.com/products/catalog-management.html)); 42% of the catalog market in 2022 ([ListEdTech](https://www.listedtech.com/blog/catalog-management-a-new-product-category/)) | Home page loads; every deeper page requested returned `202` with `x-amzn-waf-action: challenge` (Purdue, UNLV, CSULB, Georgia Southern, NC A&T, UVA). The API needs an API key and the institution's subdomain ([Squiz integration docs](https://docs.squiz.net/funnelback/docs/latest/build/plugins/acalog-basic.html)); who issues keys, and the exact hostname, are *unverified*. robots.txt asks for `crawl-delay: 120`. | HTML blocks of course links; "choose N" rules mostly prose (*unverified*: program pages couldn't be read) | `preview_program.php?catoid=&poid=`, `acalog-` classes, `Server: director` |
| Leepfrog CourseLeaf | 500+ worldwide across all CourseLeaf products ([CourseLeaf](https://www.courseleaf.com/about/)); 25% of the catalog market in 2022 | Public HTML; per-program PDF exports. robots.txt disallows `/ribbit/` and `/search/`. Some schools put it behind a firewall (NOVA). | Good: `table.sc_courselist` with or-rows (`orclass`), area headers, course codes and credits. "N credits from" is usually a prose comment row. | `courseleaf.css`, `sc_courselist`, `/ribbit/` in robots.txt |
| Coursedog | 500+ across all Coursedog products, vendor's current figure ([Coursedog](https://www.coursedog.com/company/competitors/courseleaf)); older vendor material said 300+ | Public server-rendered pages; sitemap lists programs (Utah: 552); robots.txt `Allow: /` | Best: each page embeds `__NUXT_DATA__` JSON with rule trees (`completedAllOf`, course groups). Course references are internal IDs to resolve. | Nuxt (`_nuxt/`), `app.coursedog.com` |
| Kuali Catalog | Unknown (third-party estimates conflict) | Public JSON at `https://<school>.kuali.co/api/v1/catalog/...` (`/public/catalogs/current`, `/programs/<catalogId>`, `/program/<catalogId>/<pid>`), verified at UNM | Good: `degreeRequirements` is HTML from the rule builder ("Complete all of the following") | `<school>.kuali.co`, `kuali-catalog` element |
| Watermark (formerly SmartCatalog IQ) | 16% of the catalog market in 2022 | Public HTML on `smartcatalogiq.com` or a custom domain; navigation JSON at `/Institutions/<School>/json/<year>/Catalog.json` | Fairly good: `sc-programtable-*` columns (number, title, credits), required-course headings, total credits | `smartcatalogiq.com`, `sc-` classes |
| Clean Catalog, Acadea, eLumen | Unknown | Unverified | Unverified | Unverified |

Vendor counts are suite-wide and include schools outside the US. ListEdTech tracks 1,907 institutions with a catalog system ([ListEdTech](https://www.listedtech.com/catalog-management/)); its 2022 shares are of the market it tracks, not of US colleges. NCES counts 5,819 Title IV institutions in 2023–24, 2,691 of them four-year ([NCES](https://ies.ed.gov/learn/press-release/total-number-higher-education-institutions-decreases-2-percent)). The platform fingerprints, Utah's 552 programs and the Kuali endpoints were observed on single deployments on 2026-10-29.

Platforms change: K-State moved from Acalog to Coursedog ([old](https://www.k-state.edu/registrar/systems/acalog/), [current](https://www.k-state.edu/curriculum/index.html)). A crawler has to re-detect each school's platform and pin the catalog year.

## Requirements: other sources

| Source | What it has | Access | Use |
|---|---|---|---|
| Degree Works (Ellucian) | Requirements as Scribe "requirement blocks" | Inside each school only; no public API found (*unverified*) | Structured, but school-owned |
| uAchieve / DARS (CollegeSource) | Requirements encoded by registrar staff | Inside each school; students can run their own audit as PDF | Same |
| Stellic | Structured audits; staff bulk-export API ([docs](https://docs.stellic.com/)); audit export as PDF or a CSV of remaining requirements | Staff-facing | Same |
| CUNY Transfer Explorer (T-Rex) | Program requirements for CUNY colleges, parsed from Degree Works Scribe blocks ([help](https://explorer.cuny.edu/help), [T-Rex Labs](https://www.trexlabs.org/)); code in [cvickery/transfer_app](https://github.com/cvickery/transfer_app) (BSD-3; the code licence doesn't cover the data) | Public site | Precedent: audit data turned into public requirements |
| CollegeSource Online | 181,000+ catalogs as of June 2026, per the vendor ([policy](https://tes-support.collegesource.com/article/178-catalog-collection-policy)); *unverified* by direct read | Library or institution subscription ([product](https://collegesource.com/transfer-tools/collegesource-online/)); no public API or data license found | Historical catalog years |
| TES / Transferology | TES: 6M+ course equivalencies; Transferology reports 36.7M+ ([Transferology](https://collegesource.com/transfer-tools/transferology/)) | Institutions pay; no third-party license found | Transfer features only |
| ASSIST (California) | Transferable-course and GE lists; major-prep agreements on the site | .txt extracts limited to California institution staff; API testing ran in summer 2025 and outside access is unresolved (page updated 2026-08-19, [ASSIST](https://resource.assist.org/Data)) | Public agreements viewable; no bulk access |
| Florida Common Prerequisites Manual | Program-entry prerequisite courses per major at every public college and university ([FloridaShines](https://www.floridashines.org/common-prerequisites), [manual](https://cpm.flvc.org/)) | Searchable; no bulk download found | Prerequisites only, not graduation requirements |
| Texas TCCNS, ACGM, Fields of Study | Common course numbers and lower-division blocks | Public ([TCCNS](https://tccns.org/), [ACGM](https://www.highered.texas.gov/lower-division-academic-courses/)) | Texas course normalization |
| SUNY Transfer Paths, Transfer Virginia | Shared lower-division paths; transfer guides | Web pages; Transfer Virginia returned 403 | Low |
| Credential Engine Registry (CTDL) | Credentials with condition profiles; schools publish voluntarily | Public individual-record reads; search and bulk access need approval, and the terms require a developer agreement or written permission for applications, commercial or not ([terms](https://credentialengine.org/terms-of-use/), [access](https://guidance.credentialengine.org/consuming-registry-data/)) | Small supplement; requirement detail likely thin (*unverified*) |
| BigFuture, Peterson's | Majors offered, self-reported | No public API found | Display names only |
| 1EdTech CASE and CLR, PESC, Ed-Fi | Competencies, transcripts, course inventory; Ed-Fi GraduationPlan models required credits and courses for K-12 | Public standards | None gives a national college-major requirements dataset |

Prior work: KnowPlan ([arXiv 2608.06530](https://arxiv.org/abs/2608.06530), August 2026) reports LLM extraction from 100 universities' catalogs into a typed requirement graph checked by a constraint solver. Its 96.2% is course-inventory recall; on the 100-school track, typed requirement F1 is 79.4% and structural equivalence 77.8% ([full text](https://arxiv.org/html/2608.06530v1)). It keeps extraction and planning separate. No code release stated. Single-school scrapers exist (UW, UCI, Stanford), mostly for prerequisites; no maintained multi-school requirements dataset was found (a search result, not proof none exists). State program inventories, such as New York's NYSED inventory, are another discovery source not researched here.

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

- **All pairs:** 80 rows; 78 candidate pairs after dropping Williams and Carleton Mechanical Engineering (not offered). Seven of the 78 are uncertain or nearest-equivalent programs, mostly community-college associate pathways, which aren't bachelor's majors. Of the 78: 38 readable catalog or official PDF lists, 34 on blocked catalog hosts (15 rows labelled with a challenge seen, some of them catalog home or index pages; 19 inferred from the host), 6 other (five Miami Dade rows and Howard Mathematics).
- **By platform:** open CourseLeaf 25/25 (all CourseLeaf including NOVA: 25/30); Coursedog 5/5; WordPress 4/4; PDF 4/5; Acalog 0/15; firewalled custom or CourseLeaf 0/19; JS-only 0/5.
- **By school type:** tech 5/5, private research 10/10, flagship 10/20, liberal arts 4/8, HBCU 4/10, regional 5/15, community college 0/10.

Department pages and checklist PDFs were often readable when the catalog wasn't (Ohio State Economics, the CSULB Economics checklist), which raises pairs with some readable requirement source to at least 40. They're supplementary institutional sources: the catalog wins on conflicts, and they can lag it.

Limits: single requests from one IP on one day; some blocks inferred from other pages on the same host; difficulty judged from one page each. The raw request log stayed in the session scratchpad and isn't in the repo, so the run isn't reproducible from these files.

## First 15 program files

The UVA, UW–Madison and CU Boulder files in `schools/*/programs/` showed:

- **Bot challenges:** UVA's Undergraduate Record (Acalog) and engineering site block automated requests, so UVA Mechanical Engineering has the general engineering requirements only.
- **Summaries aren't enough:** fetch tools that summarise pages paraphrase course tables; reading the page text directly was needed.
- **Format gaps:** the rule kinds can't express "at most one of these", credit-based level rules (encoded as course counts), subject codes with hyphens (UW `PATH-BIO`) or gen-ed rules.

## Recommendation

Cover majors in tiers rather than by crawling alone, and track three things separately for each program: whether the source is reachable, whether extraction is accurate, and whether the requirements are complete.

| Tier | Source | Coverage |
|---|---|---|
| All schools | IPEDS program baseline by CIP, reconciled with each catalog's major names | Every Title IV school, at CIP level |
| 1. Automatic | Parsers for CourseLeaf, Coursedog, Kuali, Watermark, each followed by a check pass against the page text | Not yet measured; needs a platform inventory of US four-year schools. The sample suggests large universities more than regionals and community colleges |
| 2. Student-supplied | Upload of the student's own degree-audit PDF (Degree Works, DARS, Stellic); keep the requirement structure, drop grades and identifiers | Conditional: one student's major and catalog year, where their school's audit can be exported. Audits reflect that student's substitutions and waivers and may list only remaining requirements; export availability and extraction quality are unmeasured |
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
