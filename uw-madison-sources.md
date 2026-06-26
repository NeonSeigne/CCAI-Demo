
Here is the markdown file content:

````markdown
# UW–Madison Course Data Scraper

A self-contained scraper that pulls UW–Madison course data from four public sources
and stores it in a local SQLite database. Distilled from the `uw-coursemap` generation
pipeline.

## Data Sources

| Data | Source | Auth |
|------|--------|------|
| Courses, descriptions, prerequisites | `guide.wisc.edu` (HTML scrape via sitemap) | none |
| Historical grade distributions | Madgrades API (`api.madgrades.com`) | API key |
| Terms, sections, meetings, instructor emails | UW Public Enroll API (`public.enroll.wisc.edu`) | none |
| Professor ratings | Rate My Professors GraphQL | scraped key |

## Setup

```bash
python -m venv .venv && source .venv/bin/activate
pip install aiohttp requests beautifulsoup4 lxml tqdm fake-useragent
```

Get a free Madgrades API key at https://api.madgrades.com (sign up → token), then:

```bash
export MADGRADES_API_KEY="a0908a08aa454580907d1221c173bc85"
```

## Run

```bash
# Scrape everything into uw_courses.db
python scraper.py --db uw_courses.db

# Only scrape the course catalog (no grades / enrollment / ratings)
python scraper.py --db uw_courses.db --steps courses
```

---

## `scraper.py`

```python
import argparse
import asyncio
import os
import re
import sqlite3
from logging import getLogger, INFO, basicConfig

import aiohttp
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

CONCURRENCY = 10


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
def get_course_urls() -> set[str]:
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


async def scrape_department(session, url):
async with session.get(url) as resp:
content = await resp.read()
soup = BeautifulSoup(content, "html.parser")
title_el = soup.find(class_="page-title")
full_subject = title_el.get_text(strip=True) if title_el else ""
blocks = soup.find_all("div", class_="courseblock")
return full_subject, blocks


async def scrape_courses(conn):
urls = get_course_urls()
connector = aiohttp.TCPConnector(limit=CONCURRENCY)
timeout = aiohttp.ClientTimeout(total=60)
async with aiohttp.ClientSession(
connector=connector, timeout=timeout, headers=HEADERS
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

async with session.get(
course["url"] + "/grades",
headers={"Authorization": f"Token token={api_key}", "User-Agent": USER_AGENT},
) as resp:
data = await resp.json()

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

async with aiohttp.ClientSession() as session:
async with session.get(f"{MADGRADES_API}courses?per_page=100", headers=auth) as r:
first = await r.json()
total_pages = first["totalPages"]

async def page(p):
async with sem:
url = f"{MADGRADES_API}courses?per_page=100&page={p}"
async with session.get(url, headers=auth) as r:
data = await r.json()
for course in data["results"]:
await fetch_grades(session, course, course_ids, api_key, conn)

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


async def scrape_term_sections(session, term_code, course_ids, conn):
base_query = {
"selectedTerm": str(term_code),
"queryString": "",
"filters": [],
"page": 1,
"pageSize": 1,
}
async with session.post(ENROLL_QUERY_URL, json=base_query) as r:
found = (await r.json())["found"]
if not found:
return
base_query["pageSize"] = found
async with session.post(ENROLL_QUERY_URL, json=base_query) as r:
hits = (await r.json())["hits"]

cur = conn.cursor()
for hit in hits:
number = int(hit["catalogNumber"])
if len(hit.get("allCrossListedSubjects", [])) > 1:
subj_src = hit["allCrossListedSubjects"]
else:
subj_src = [hit["subject"]]
subjects = sorted({s["shortDescription"].replace(" ", "") for s in subj_src})
identifier = ref_identifier(subjects, number)
if identifier not in course_ids:
continue

pkg_url = f'{ENROLL_PACKAGE_URL}/{term_code}/{hit["subject"]["subjectCode"]}/{hit["courseId"]}'
try:
async with session.get(pkg_url) as r:
packages = await r.json()
except Exception:
continue

for package in packages:
for s in package.get("sections", []):
names = []
for ins in s.get("instructors", []):
n = ins["name"]
full = f'{n["first"]} {n["last"]}'
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
f'{s["type"]} {s["sectionNumber"]}', s["type"],
",".join(names),
status.get("currentlyEnrolled", 0), status.get("capacity", 0)),
)
conn.commit()


async def scrape_enrollment(conn):
course_ids = {r[0] for r in conn.execute("SELECT identifier FROM courses")}
terms = sync_terms(conn)
connector = aiohttp.TCPConnector(limit=CONCURRENCY)
async with aiohttp.ClientSession(connector=connector, headers=HEADERS) as session:
await tqdm.gather(
*[scrape_term_sections(session, code, course_ids, conn) for code in terms],
desc="Terms", unit="term",
)
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
async with aiohttp.ClientSession() as session:
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
parser = argparse.ArgumentParser(description="Scrape UW-Madison course data.")
parser.add_argument("--db", default="uw_courses.db")
parser.add_argument(
"--steps",
default="courses,grades,enrollment,ratings",
help="Comma-separated subset of: courses,grades,enrollment,ratings",
)
args = parser.parse_args()
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
asyncio.run(scrape_enrollment(conn))
if "ratings" in steps:
asyncio.run(scrape_ratings(conn))

conn.close()
logger.info("Done -> %s", args.db)


if __name__ == "__main__":
main()
```

## Notes & Caveats

**Order matters.** Run `courses` first; `grades`, `enrollment`, and `ratings` all
resolve against courses/instructors already stored in the DB.
**Madgrades key required** for the `grades` step. The other three steps need no auth.
**Be polite.** The original pipeline caches every HTTP response (`requests_cache` /
`aiohttp_client_cache`) so re-runs don't hammer the servers. This script does not cache;
`CONCURRENCY = 10` mirrors the upstream connection limit. Consider adding caching or
rate-limiting if you run it repeatedly.
**Prerequisites** are stored two ways: the raw `prereq_text`, and a flat
`course_prerequisites` edge table of linked courses. The upstream project additionally
builds a full AND/OR prerequisite *syntax tree* (`requirement_ast.py`) — port that module
if you need the logical structure rather than a flat list.
**RMP key is scraped** from the RMP homepage JS at runtime; if RMP changes their markup,
update the regex in `scrape_rmp_key()`.
**Legal/ToS:** this scrapes public pages and APIs. Check each source's terms of use before
running at scale or redistributing the data.
````

---
