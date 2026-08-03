"""
UW-Madison Course Data Scraper.

A self-contained scraper that pulls UW-Madison course data from four public
sources and stores it in a local SQLite database. Distilled from the
``uw-coursemap`` generation pipeline.

Data sources:
    - Courses, descriptions, prerequisites  : guide.wisc.edu (HTML via sitemap), no auth
    - Historical grade distributions        : Madgrades API, requires MADGRADES_API_KEY
    - Terms, sections, meetings, emails      : UW Public Enroll API, no auth
    - Professor ratings                      : Rate My Professors GraphQL, scraped key

Order matters: run ``courses`` first; ``grades``, ``enrollment`` and
``ratings`` all resolve against courses/instructors already stored in the DB.

Usage:
    # Scrape everything into uw_courses.db
    python scrape_uw_courses.py --db uw_courses.db

    # Only the catalog (no grades / enrollment / ratings)
    python scrape_uw_courses.py --db uw_courses.db --steps courses

    # Catalog + grades + enrollment (ratings served live by the app instead)
    python scrape_uw_courses.py --db uw_courses.db --steps courses,grades,enrollment

The ``grades`` step needs a free Madgrades API key
(https://api.madgrades.com) exported as MADGRADES_API_KEY.
"""

import argparse
import asyncio
import os
import re
import sqlite3
import ssl
from logging import getLogger, INFO, basicConfig

import aiohttp
import certifi
import requests
from bs4 import BeautifulSoup, NavigableString
from tqdm.asyncio import tqdm

basicConfig(level=INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = getLogger("uw-scraper")

# --------------------------------------------------------------------------- #
# Endpoints (lifted directly from the uw-coursemap pipeline)
# --------------------------------------------------------------------------- #
SITEMAP_URL = "https://guide.wisc.edu/sitemap.xml"
FACULTY_URL = "https://guide.wisc.edu/faculty/"

MADGRADES_API = "https://api.madgrades.com/v1/"

ENROLL_TERMS_URL = "https://public.enroll.wisc.edu/api/search/v1/aggregate"
ENROLL_QUERY_URL = "https://public.enroll.wisc.edu/api/search/v1"
ENROLL_PACKAGE_URL = "https://public.enroll.wisc.edu/api/search/v1/enrollmentPackages"

RMP_URL = "https://www.ratemyprofessors.com/"
RMP_GRAPHQL_URL = "https://www.ratemyprofessors.com/graphql"
RMP_SCHOOL_ID = "U2Nob29sLTE4NDE4"  # UW-Madison

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
HEADERS = {"User-Agent": USER_AGENT}

# Mutable: overridable with --concurrency. Lower it on flaky networks.
CONCURRENCY = 10


def _ssl_context() -> ssl.SSLContext:
    """SSL context backed by certifi's CA bundle.

    Python builds on some platforms (notably macOS) ship without a usable
    system CA store, which makes aiohttp's default TLS verification fail.
    Pinning certifi keeps verification on while working everywhere.
    """
    return ssl.create_default_context(cafile=certifi.where())


def _connector() -> aiohttp.TCPConnector:
    return aiohttp.TCPConnector(limit=CONCURRENCY, ssl=_ssl_context())


async def _get_json(session, url, headers=None, retries: int = 4):
    """GET *url* and return parsed JSON, retrying transient network errors.

    Returns ``None`` after exhausting retries so callers can skip a single
    failed resource instead of aborting the whole run (a raised exception in
    ``asyncio.gather`` tears down the shared session for every in-flight task).
    """
    last_exc = None
    for attempt in range(retries):
        try:
            async with session.get(url, headers=headers) as resp:
                return await resp.json()
        except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
            last_exc = exc
            await asyncio.sleep(1 + attempt)
    logger.warning("Giving up on %s: %s", url, last_exc)
    return None


# --------------------------------------------------------------------------- #
# Course reference helper (subject(s) + number, e.g. "COMP SCI/MATH 240")
# --------------------------------------------------------------------------- #
def parse_course_ref(text: str):
    """Return (sorted_subjects_list, number) from a raw course code string."""
    if not text:
        return None
    text = re.sub(r"\s+", " ", text).replace("\u200b", " ").replace("\u00a0", " ").strip()
    m = re.match(r"(\D+)(\d+)", text)
    if not m:
        return None
    subjects = sorted({s.replace(" ", "") for s in m.group(1).split("/")})
    return subjects, int(m.group(2))


def ref_identifier(subjects, number):
    return f"{'/'.join(subjects)} {number}"


# --------------------------------------------------------------------------- #
# SQLite schema
# --------------------------------------------------------------------------- #
def init_db(path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS subjects (
            abbreviation TEXT PRIMARY KEY,
            full_name    TEXT
        );

        CREATE TABLE IF NOT EXISTS courses (
            identifier   TEXT PRIMARY KEY,   -- "COMP SCI 300"
            subjects     TEXT,               -- comma-separated
            number       INTEGER,
            title        TEXT,
            description  TEXT,
            prereq_text  TEXT
        );

        CREATE TABLE IF NOT EXISTS course_prerequisites (
            course_identifier TEXT,
            prereq_identifier TEXT,
            PRIMARY KEY (course_identifier, prereq_identifier)
        );

        CREATE TABLE IF NOT EXISTS grades (
            course_identifier TEXT,
            term_code         TEXT,   -- "cumulative" or a numeric term code
            total INTEGER, a INTEGER, ab INTEGER, b INTEGER, bc INTEGER,
            c INTEGER, d INTEGER, f INTEGER,
            satisfactory INTEGER, unsatisfactory INTEGER,
            credit INTEGER, no_credit INTEGER, passed INTEGER,
            incomplete INTEGER, no_work INTEGER, not_reported INTEGER, other INTEGER,
            instructors TEXT,
            PRIMARY KEY (course_identifier, term_code)
        );

        CREATE TABLE IF NOT EXISTS terms (
            term_code   INTEGER PRIMARY KEY,
            description TEXT
        );

        CREATE TABLE IF NOT EXISTS sections (
            course_identifier TEXT,
            term_code         TEXT,
            section           TEXT,
            type              TEXT,
            instructors       TEXT,
            current_enrolled  INTEGER,
            capacity          INTEGER
        );

        CREATE TABLE IF NOT EXISTS instructors (
            name        TEXT PRIMARY KEY,
            email       TEXT,
            position    TEXT,
            department  TEXT,
            avg_rating  REAL,
            avg_difficulty REAL,
            num_ratings INTEGER,
            would_take_again REAL
        );
        """
    )
    conn.commit()
    return conn


# --------------------------------------------------------------------------- #
# 1. COURSE CATALOG  (guide.wisc.edu)
# --------------------------------------------------------------------------- #
def get_course_urls() -> set:
    logger.info("Fetching course sitemap...")
    resp = requests.get(SITEMAP_URL, headers=HEADERS)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.content, "xml")
    urls = {
        loc.text
        for loc in soup.find_all("loc")
        if re.search(r"/courses/.+", loc.text)
    }
    logger.info("Found %d department course pages", len(urls))
    return urls


def parse_course_block(block):
    """Parse a single <div class="courseblock"> into a dict."""
    title_el = block.find("p", class_="courseblocktitle noindent")
    if not title_el:
        return None
    code_el = title_el.find("span", class_="courseblockcode")
    if not code_el:
        return None
    ref = parse_course_ref(code_el.get_text(strip=True))
    if not ref:
        return None
    subjects, number = ref
    identifier = ref_identifier(subjects, number)

    raw_title = title_el.get_text(strip=True).replace(code_el.get_text(strip=True), "").strip()
    title = raw_title.split("\u2014", 1)[-1].strip() if "\u2014" in raw_title else raw_title

    desc_el = block.find("p", class_="courseblockdesc noindent")
    description = desc_el.get_text(strip=True) if desc_el else ""

    # Prerequisites: stored as raw text + the set of linked course references.
    prereq_text = ""
    prereq_refs = set()
    cb_extras = block.find("div", class_="cb-extras")
    if cb_extras:
        header = cb_extras.find(
            "span", class_="cbextra-label", string=re.compile("Requisites:")
        )
        if header:
            data = header.find_next("span", class_="cbextra-data")
            prereq_text = data.get_text(strip=True)
            for node in data.contents:
                if not isinstance(node, NavigableString) and node.name == "a":
                    linked = parse_course_ref(node.get("title", "").strip())
                    if linked and ref_identifier(*linked) != identifier:
                        prereq_refs.add(ref_identifier(*linked))

    return {
        "identifier": identifier,
        "subjects": subjects,
        "number": number,
        "title": title,
        "description": description,
        "prereq_text": prereq_text,
        "prereq_refs": prereq_refs,
    }


async def scrape_department(session, url, retries: int = 3):
    last_exc = None
    for attempt in range(retries):
        try:
            async with session.get(url) as resp:
                content = await resp.read()
            soup = BeautifulSoup(content, "html.parser")
            title_el = soup.find(class_="page-title")
            full_subject = title_el.get_text(strip=True) if title_el else ""
            blocks = soup.find_all("div", class_="courseblock")
            return full_subject, blocks
        except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
            last_exc = exc
            await asyncio.sleep(1 + attempt)
    logger.warning("Giving up on %s: %s", url, last_exc)
    return "", []


async def scrape_courses(conn):
    urls = get_course_urls()
    timeout = aiohttp.ClientTimeout(total=60)
    async with aiohttp.ClientSession(
        connector=_connector(), timeout=timeout, headers=HEADERS
    ) as session:
        results = await tqdm.gather(
            *[scrape_department(session, u) for u in urls],
            desc="Departments",
            unit="dept",
        )

    cur = conn.cursor()
    course_count = 0
    for full_subject, blocks in results:
        m = re.match(r"(.*)\((.*)\)", full_subject)
        if m:
            full_name = m.group(1).strip()
            abbreviation = m.group(2).replace(" ", "")
            cur.execute(
                "INSERT OR REPLACE INTO subjects (abbreviation, full_name) VALUES (?, ?)",
                (abbreviation, full_name),
            )
        for block in blocks:
            c = parse_course_block(block)
            if not c:
                continue
            cur.execute(
                """INSERT OR REPLACE INTO courses
                (identifier, subjects, number, title, description, prereq_text)
                VALUES (?, ?, ?, ?, ?, ?)""",
                (c["identifier"], ",".join(c["subjects"]), c["number"],
                 c["title"], c["description"], c["prereq_text"]),
            )
            for pr in c["prereq_refs"]:
                cur.execute(
                    """INSERT OR IGNORE INTO course_prerequisites
                    (course_identifier, prereq_identifier) VALUES (?, ?)""",
                    (c["identifier"], pr),
                )
            course_count += 1
    conn.commit()
    logger.info("Stored %d courses", course_count)


# --------------------------------------------------------------------------- #
# 2. GRADES  (Madgrades API)
# --------------------------------------------------------------------------- #
GRADE_FIELDS = [
    ("total", "total"), ("a", "aCount"), ("ab", "abCount"), ("b", "bCount"),
    ("bc", "bcCount"), ("c", "cCount"), ("d", "dCount"), ("f", "fCount"),
    ("satisfactory", "sCount"), ("unsatisfactory", "uCount"),
    ("credit", "crCount"), ("no_credit", "nCount"), ("passed", "pCount"),
    ("incomplete", "iCount"), ("no_work", "nwCount"),
    ("not_reported", "nrCount"), ("other", "otherCount"),
]


def madgrades_terms(api_key):
    resp = requests.get(
        MADGRADES_API + "terms",
        headers={"Authorization": f"Token token={api_key}", "User-Agent": USER_AGENT},
    )
    return {int(k): v for k, v in resp.json().items()}


async def fetch_grades(session, course, course_ids, api_key, conn):
    """course = a Madgrades course result; resolve to our identifier and store grades."""
    subjects = sorted({s["abbreviation"].replace(" ", "") for s in course["subjects"]})
    identifier = ref_identifier(subjects, course["number"])
    if identifier not in course_ids:
        return  # not in our catalog

    data = await _get_json(
        session,
        course["url"] + "/grades",
        headers={"Authorization": f"Token token={api_key}", "User-Agent": USER_AGENT},
    )
    if not data or "cumulative" not in data:
        return

    cur = conn.cursor()

    def row(term_code, grade_json, instructors):
        vals = [grade_json.get(src, 0) for _, src in GRADE_FIELDS]
        cur.execute(
            f"""INSERT OR REPLACE INTO grades
            (course_identifier, term_code,
             {", ".join(dst for dst, _ in GRADE_FIELDS)}, instructors)
            VALUES ({", ".join(["?"] * (len(GRADE_FIELDS) + 3))})""",
            [identifier, term_code, *vals, instructors],
        )

    row("cumulative", data["cumulative"], "")
    for offering in data.get("courseOfferings", []):
        instructors = sorted({
            ins["name"]
            for sec in offering.get("sections", [])
            for ins in sec.get("instructors", [])
        })
        row(str(offering["termCode"]), offering["cumulative"], ",".join(instructors))
    conn.commit()


async def scrape_grades(conn, api_key):
    course_ids = {r[0] for r in conn.execute("SELECT identifier FROM courses")}
    sem = asyncio.Semaphore(CONCURRENCY)
    auth = {"Authorization": f"Token token={api_key}", "User-Agent": USER_AGENT}

    async with aiohttp.ClientSession(connector=_connector()) as session:
        first = await _get_json(session, f"{MADGRADES_API}courses?per_page=100", headers=auth)
        if not first:
            raise SystemExit("Could not reach Madgrades API (check key / network)")
        total_pages = first["totalPages"]

        async def page(p):
            async with sem:
                url = f"{MADGRADES_API}courses?per_page=100&page={p}"
                data = await _get_json(session, url, headers=auth)
            if not data:
                return
            for course in data.get("results", []):
                try:
                    await fetch_grades(session, course, course_ids, api_key, conn)
                except Exception as exc:  # never let one course abort the page
                    logger.warning("grades fetch failed for a course: %s", exc)

        await tqdm.gather(
            *[page(p) for p in range(1, total_pages + 1)],
            desc="Madgrades pages", unit="page",
        )
    logger.info("Grades stored")


# --------------------------------------------------------------------------- #
# 3. TERMS + SECTIONS  (UW Public Enroll API)
# --------------------------------------------------------------------------- #
def sync_terms(conn):
    resp = requests.get(ENROLL_TERMS_URL, headers=HEADERS)
    terms = {}
    cur = conn.cursor()
    for term in resp.json()["terms"]:
        code = int(term["termCode"])
        terms[code] = term["shortDescription"]
        cur.execute(
            "INSERT OR REPLACE INTO terms (term_code, description) VALUES (?, ?)",
            (code, term["shortDescription"]),
        )
    conn.commit()
    return terms


async def _post_json(session, url, payload, retries: int = 4):
    last_exc = None
    for attempt in range(retries):
        try:
            async with session.post(url, json=payload) as resp:
                return await resp.json()
        except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
            last_exc = exc
            await asyncio.sleep(1 + attempt)
    logger.warning("POST gave up on %s: %s", url, last_exc)
    return None


def _store_packages(conn, identifier, term_code, packages):
    cur = conn.cursor()
    for package in packages:
        for s in package.get("sections", []):
            names = []
            for ins in s.get("instructors", []):
                n = ins.get("name") or {}
                full = f'{n.get("first", "")} {n.get("last", "")}'.strip()
                if not full:
                    continue
                names.append(full)
                cur.execute(
                    "INSERT OR IGNORE INTO instructors (name, email) VALUES (?, ?)",
                    (full, ins.get("email")),
                )
            status = s.get("enrollmentStatus", {})
            cur.execute(
                """INSERT INTO sections
                (course_identifier, term_code, section, type,
                 instructors, current_enrolled, capacity)
                VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (identifier, str(term_code),
                 f'{s.get("type", "")} {s.get("sectionNumber", "")}'.strip(), s.get("type", ""),
                 ",".join(names),
                 status.get("currentlyEnrolled", 0), status.get("capacity", 0)),
            )
    conn.commit()


async def scrape_term_sections(session, term_code, course_ids, conn, sem):
    """Scrape all in-catalog sections for one term.

    Section packages are fetched concurrently (bounded by *sem*); the two
    search POSTs and each package GET are retried so a transient failure skips
    a single resource instead of aborting the whole term.
    """
    base_query = {
        "selectedTerm": str(term_code),
        "queryString": "",
        "filters": [],
        "page": 1,
        "pageSize": 1,
    }
    data = await _post_json(session, ENROLL_QUERY_URL, base_query)
    found = (data or {}).get("found")
    if not found:
        return
    base_query["pageSize"] = found
    data = await _post_json(session, ENROLL_QUERY_URL, base_query)
    hits = (data or {}).get("hits") or []

    targets = []
    for hit in hits:
        try:
            number = int(hit["catalogNumber"])
        except (KeyError, ValueError, TypeError):
            continue
        if len(hit.get("allCrossListedSubjects", [])) > 1:
            subj_src = hit["allCrossListedSubjects"]
        else:
            subj_src = [hit["subject"]]
        subjects = sorted({s["shortDescription"].replace(" ", "") for s in subj_src})
        identifier = ref_identifier(subjects, number)
        if identifier not in course_ids:
            continue
        pkg_url = f'{ENROLL_PACKAGE_URL}/{term_code}/{hit["subject"]["subjectCode"]}/{hit["courseId"]}'
        targets.append((identifier, pkg_url))

    async def one(identifier, pkg_url):
        async with sem:
            packages = await _get_json(session, pkg_url)
        if not packages:
            return
        try:
            _store_packages(conn, identifier, term_code, packages)
        except Exception as exc:
            logger.warning("section store failed for %s: %s", identifier, exc)

    await tqdm.gather(
        *[one(i, u) for i, u in targets],
        desc=f"Term {term_code}", unit="course", leave=False,
    )


async def scrape_enrollment(conn, max_terms: int = 0):
    course_ids = {r[0] for r in conn.execute("SELECT identifier FROM courses")}
    terms = sync_terms(conn)
    codes = sorted(terms, reverse=True)  # most recent terms first
    if max_terms:
        codes = codes[:max_terms]
    sem = asyncio.Semaphore(CONCURRENCY)
    async with aiohttp.ClientSession(connector=_connector(), headers=HEADERS) as session:
        # Process terms one at a time; packages within a term run concurrently.
        for code in codes:
            logger.info("Scraping sections for term %s (%s)", code, terms[code])
            await scrape_term_sections(session, code, course_ids, conn, sem)
    logger.info("Enrollment / sections stored")


# --------------------------------------------------------------------------- #
# 4. INSTRUCTOR RATINGS  (Rate My Professors)
# --------------------------------------------------------------------------- #
RMP_QUERY = """
query SearchTeacher($query: TeacherSearchQuery!) {
  newSearch {
    teachers(query: $query, first: 50) {
      edges { node {
        firstName lastName
        avgRatingRounded avgDifficultyRounded
        numRatings wouldTakeAgainPercentRounded
      } }
    }
  }
}
"""


def scrape_rmp_key():
    resp = requests.get(RMP_URL, headers=HEADERS)
    m = re.search(r'"REACT_APP_GRAPHQL_AUTH"\s*:\s*"([^"]+)"', resp.text)
    if not m:
        raise RuntimeError("Could not scrape RMP GraphQL key")
    return m.group(1)


def get_faculty():
    """Faculty positions/departments from the guide faculty page."""
    resp = requests.get(FACULTY_URL, headers=HEADERS)
    soup = BeautifulSoup(resp.content, "html.parser")
    faculty = {}
    for ul in soup.find_all("ul", class_="uw-people"):
        for li in ul.find_all("li"):
            name_el = li.find("span", class_="faculty-name")
            if not name_el:
                continue
            details = li.get_text(separator="\n").split("\n")
            faculty[name_el.text] = (
                details[1] if len(details) > 1 else None,
                details[2] if len(details) > 2 else None,
            )
    return faculty


async def fetch_rating(session, name, api_key, sem):
    payload = {
        "query": RMP_QUERY,
        "variables": {"query": {"text": name, "schoolID": RMP_SCHOOL_ID}},
    }
    headers = {"Authorization": f"Basic {api_key}", "User-Agent": USER_AGENT}
    async with sem:
        try:
            async with session.post(RMP_GRAPHQL_URL, headers=headers, json=payload) as r:
                data = await r.json()
        except Exception:
            return None
    edges = data.get("data", {}).get("newSearch", {}).get("teachers", {}).get("edges", [])
    last = name.split()[-1].lower()
    for edge in edges:  # simple exact-last-name match
        node = edge["node"]
        if node["lastName"].lower() == last:
            return node
    return None


async def scrape_ratings(conn):
    api_key = scrape_rmp_key()
    faculty = get_faculty()
    names = [r[0] for r in conn.execute("SELECT name FROM instructors")]
    sem = asyncio.Semaphore(CONCURRENCY)
    cur = conn.cursor()
    async with aiohttp.ClientSession(connector=_connector()) as session:
        ratings = await tqdm.gather(
            *[fetch_rating(session, n, api_key, sem) for n in names],
            desc="RMP", unit="instructor",
        )
    for name, node in zip(names, ratings):
        position = department = None
        if name in faculty:
            position, department = faculty[name]
        cur.execute(
            """UPDATE instructors SET
            position = ?, department = ?, avg_rating = ?, avg_difficulty = ?,
            num_ratings = ?, would_take_again = ? WHERE name = ?""",
            (position, department,
             node["avgRatingRounded"] if node else None,
             node["avgDifficultyRounded"] if node else None,
             node["numRatings"] if node else None,
             node["wouldTakeAgainPercentRounded"] if node else None,
             name),
        )
    conn.commit()
    logger.info("Ratings stored")


# --------------------------------------------------------------------------- #
# Entry point
# --------------------------------------------------------------------------- #
def main():
    global CONCURRENCY
    parser = argparse.ArgumentParser(description="Scrape UW-Madison course data.")
    parser.add_argument("--db", default="uw_courses.db")
    parser.add_argument(
        "--steps",
        default="courses,grades,enrollment,ratings",
        help="Comma-separated subset of: courses,grades,enrollment,ratings",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=CONCURRENCY,
        help="Max concurrent HTTP connections (lower it on flaky networks)",
    )
    parser.add_argument(
        "--max-terms",
        type=int,
        default=0,
        help="For the enrollment step, only scrape the N most recent terms "
             "(0 = all terms). Useful to keep section data current and fast.",
    )
    args = parser.parse_args()

    CONCURRENCY = args.concurrency
    steps = set(args.steps.split(","))
    conn = init_db(args.db)

    if "courses" in steps:
        asyncio.run(scrape_courses(conn))
    if "grades" in steps:
        key = os.environ.get("MADGRADES_API_KEY")
        if not key:
            raise SystemExit("MADGRADES_API_KEY is not set")
        asyncio.run(scrape_grades(conn, key))
    if "enrollment" in steps:
        asyncio.run(scrape_enrollment(conn, max_terms=args.max_terms))
    if "ratings" in steps:
        asyncio.run(scrape_ratings(conn))

    conn.close()
    logger.info("Done -> %s", args.db)


if __name__ == "__main__":
    main()
