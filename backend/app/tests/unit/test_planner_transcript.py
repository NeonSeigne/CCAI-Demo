"""POST /api/planner/transcript and the transcript scan (setup-dialog R5, R6, R8, R9, R10)."""

import asyncio
import io
import logging
import tempfile
import unittest
import zipfile
from types import SimpleNamespace
from unittest.mock import patch

import PyPDF2
from bson import ObjectId
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes import planner as routes
from app.core.auth import get_current_active_user
from app.models.user import User
from app.planner import service, transcript
from app.planner.facts import CourseFacts
from app.tests.unit.planner_fakes import TERM, FakePlans, Program, Rule, course

SCHOOL = "uva"

# Synthetic transcripts, one per school's layout.
UVA = """University of Virginia - Unofficial Academic Record
Name: Test Student                 ID: 0000000
Fall 2024
ECON 2010   Principles of Microeconomics       3.0   A-
MATH 1310   Calculus I                         4.0   B+
CS 1110     Introduction to Programming        3.0   W
Spring 2025
STAT 2120   Introduction to Statistical Analysis 4.0 F
ECON 2020   Principles of Macroeconomics       3.0   CR
Fall 2025
STAT 2120   Introduction to Statistical Analysis 4.0 C
ECON 3010   Intermediate Microeconomics        3.0   IP
Cumulative GPA 3.40   Total Credits 24.0
"""

UW = """UNIVERSITY OF WISCONSIN-MADISON   UNOFFICIAL TRANSCRIPT
STUDENT ID 9081234567
FALL 2024
COMP SCI 300   PROGRAMMING II                3.00  AB
E M A 201      STATICS                       3.00  B
MATH 221       CALCULUS & ANALYTIC GEOM 1    5.00  F
SPRING 2025
MATH 221       CALCULUS & ANALYTIC GEOM 1    5.00  BC
COMP SCI 400   PROGRAMMING III               3.00  NC
FALL 2025
COMP SCI 400   PROGRAMMING III               3.00
TOTAL CREDITS 11.00
"""

CU = """University of Colorado Boulder  Unofficial Transcript
Fall 2024
CSCI 1300 Computer Science 1: Starting Computing 4.0 A
APPM 1350 Calculus 1 for Engineers 4.0 WF
Spring 2025
CSCI 2270 Computer Science 2: Data Structures 4.0 B-   WRTG 1150 First-Year Writing and Rhetoric 3.0 P
PHYS 1110 General Physics 1 4.0 I
"""

PROGRAMS = [
    Program("econ-ba", "Economics B.A.", rules=(
        Rule("core", "Core", "all_of", courses=("ECON 2010", "ECON 2020", "COMP SCI 300", "CSCI 1300")),
        Rule("calc", "Calculus", "one_of_groups", groups=(("MATH 1310",), ("MATH 221",), ("APPM 1350",))),
        Rule("el", "Electives", "level", subjects=("ECON", "E M A", "STAT"), min_level=3000, n=2),
    )),
]
CATALOG = {c: course(c) for c in (
    "ECON 2010", "ECON 2020", "ECON 3010", "MATH 1310", "CS 1110", "STAT 2120", "COMP SCI 300", "COMP SCI 400",
    "E M A 201", "MATH 221", "CSCI 1300", "CSCI 2270", "APPM 1350", "WRTG 1150", "PHYS 1110",
)}

DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def docx_bytes(text: str) -> bytes:
    """A minimal DOCX: one paragraph per line."""
    paragraphs = "".join(f"<w:p><w:r><w:t xml:space=\"preserve\">{line}</w:t></w:r></w:p>"
                         for line in text.replace("&", "&amp;").splitlines())
    document = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
                f"<w:body>{paragraphs}</w:body></w:document>")
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_STORED) as zf:
        zf.writestr("[Content_Types].xml", '<?xml version="1.0"?><Types/>')
        zf.writestr("word/document.xml", document)
    return out.getvalue()


def pdf_bytes(lines) -> bytes:
    """A one-page PDF with ``lines`` of Helvetica text."""
    ops = ["BT", "/F1 10 Tf", "14 TL", "50 750 Td"]
    for line in lines:
        escaped = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        ops += [f"({escaped}) Tj", "T*"]
    ops.append("ET")
    stream = "\n".join(ops).encode("latin-1")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> "
        b"/Contents 4 0 R >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = io.BytesIO()
    out.write(b"%PDF-1.4\n")
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(out.tell())
        out.write(f"{number} 0 obj\n".encode() + body + b"\nendobj\n")
    xref = out.tell()
    out.write(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode())
    for offset in offsets:
        out.write(f"{offset:010d} 00000 n \n".encode())
    out.write(f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
    return out.getvalue()


def blank_pdf(pages: int, password: str = None) -> bytes:
    writer = PyPDF2.PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(612, 792)
    if password:
        writer.encrypt(password)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def by_id(body):
    return {row["id"]: row for row in body["rows"]}


class TranscriptRouteTests(unittest.TestCase):
    def setUp(self):
        self.db = SimpleNamespace(plans=FakePlans())
        self.provider_calls = []

        async def provider(ids, term):
            self.provider_calls.append((tuple(ids), term))
            return {i: CATALOG.get(i) or CourseFacts(identifier=i, known="no") for i in ids}

        patches = [
            patch.object(service, "get_database", return_value=self.db),
            patch.object(service, "facts_provider", provider),
            patch.object(service, "default_term", return_value=TERM),
            patch.object(service, "covered_terms", return_value=[TERM]),
            patch.object(service, "list_programs", return_value=PROGRAMS),
            patch.object(routes, "_school", return_value=SCHOOL),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        self.app = FastAPI()
        self.app.include_router(routes.router, prefix="/api")
        self.user = User(_id=ObjectId(), firstName="T", lastName="U", email="t@example.com", hashed_password="x")
        self.app.dependency_overrides[get_current_active_user] = lambda: self.user
        self.client = TestClient(self.app)

    def upload(self, data, filename="transcript.txt", content_type="text/plain"):
        if isinstance(data, str):
            data = data.encode()
        return self.client.post("/api/planner/transcript", files={"file": (filename, data, content_type)})

    def assert_error(self, response, status_code, code):
        self.assertEqual(response.status_code, status_code, response.text)
        self.assertEqual(response.json()["detail"], {"code": code})

    # -- schools -------------------------------------------------------------

    def test_uva_transcript(self):
        response = self.upload(UVA)
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        rows = by_id(body)
        self.assertEqual(list(rows), ["ECON 2010", "MATH 1310", "CS 1110", "STAT 2120", "ECON 2020", "ECON 3010"])
        self.assertEqual(rows["ECON 2010"], {
            "id": "ECON 2010", "title": "ECON 2010 title", "grade": "A-", "credits": 3.0, "term": "Fall 2024",
            "ticked": True, "checked": True, "in_catalog": True,
        })
        self.assertEqual((rows["MATH 1310"]["grade"], rows["MATH 1310"]["credits"]), ("B+", 4.0))
        self.assertEqual((rows["CS 1110"]["grade"], rows["CS 1110"]["ticked"]), ("W", False))
        # Failed in spring, passed in fall: one row, the passing attempt.
        self.assertEqual((rows["STAT 2120"]["grade"], rows["STAT 2120"]["term"], rows["STAT 2120"]["ticked"]),
                         ("C", "Fall 2025", True))
        self.assertTrue(rows["ECON 2020"]["ticked"])  # CR
        self.assertEqual((rows["ECON 3010"]["grade"], rows["ECON 3010"]["ticked"]), ("IP", False))
        self.assertEqual(body["counts"], {"rows": 6, "ticked": 4, "not_checked": 0, "not_in_catalog": 0})
        # One batch for the plan's term, each code once.
        self.assertEqual({term for _, term in self.provider_calls}, {TERM})
        self.assertEqual(sorted(i for ids, _ in self.provider_calls for i in ids), sorted(rows))

    def test_uw_transcript_with_spaced_subjects(self):
        rows = by_id(self.upload(UW).json())
        self.assertEqual(list(rows), ["COMP SCI 300", "E M A 201", "MATH 221", "COMP SCI 400"])
        self.assertEqual((rows["COMP SCI 300"]["grade"], rows["COMP SCI 300"]["ticked"]), ("AB", True))
        self.assertEqual((rows["E M A 201"]["grade"], rows["E M A 201"]["credits"]), ("B", 3.0))
        self.assertEqual((rows["MATH 221"]["grade"], rows["MATH 221"]["term"], rows["MATH 221"]["credits"]),
                         ("BC", "Spring 2025", 5.0))
        # NC then no grade: nothing passed, so the latest attempt, unticked.
        self.assertEqual((rows["COMP SCI 400"]["grade"], rows["COMP SCI 400"]["term"], rows["COMP SCI 400"]["ticked"]),
                         (None, "Fall 2025", False))

    def test_cu_transcript_with_two_courses_on_a_line(self):
        rows = by_id(self.upload(CU).json())
        self.assertEqual(list(rows), ["CSCI 1300", "APPM 1350", "CSCI 2270", "WRTG 1150", "PHYS 1110"])
        self.assertEqual(rows["CSCI 1300"]["credits"], 4.0)
        self.assertEqual({i: r["ticked"] for i, r in rows.items()},
                         {"CSCI 1300": True, "APPM 1350": False, "CSCI 2270": True, "WRTG 1150": True,
                          "PHYS 1110": False})
        self.assertEqual(rows["WRTG 1150"]["term"], "Spring 2025")

    def test_docx_and_pdf_uploads(self):
        docx = self.upload(docx_bytes(UW), "transcript.docx", DOCX_TYPE)
        self.assertEqual(docx.status_code, 200, docx.text)
        self.assertEqual(list(by_id(docx.json())), ["COMP SCI 300", "E M A 201", "MATH 221", "COMP SCI 400"])
        pdf = self.upload(pdf_bytes(CU.splitlines()), "transcript.pdf", "application/pdf")
        self.assertEqual(pdf.status_code, 200, pdf.text)
        self.assertEqual(list(by_id(pdf.json())), ["CSCI 1300", "APPM 1350", "CSCI 2270", "WRTG 1150", "PHYS 1110"])
        # A generic type is read by the file's extension.
        generic = self.upload(docx_bytes(UVA), "Transcript.DOCX", "application/octet-stream")
        self.assertEqual(generic.status_code, 200, generic.text)

    # -- catalog -------------------------------------------------------------

    def test_codes_not_in_the_catalog_are_flagged_and_unticked(self):
        body = self.upload("Fall 2024\nECON 2010 Microeconomics 3.0 A\nHIST 1501 Lost Worlds 3.0 A\n").json()
        rows = by_id(body)
        self.assertEqual((rows["HIST 1501"]["in_catalog"], rows["HIST 1501"]["checked"], rows["HIST 1501"]["ticked"]),
                         (False, True, False))
        self.assertEqual(rows["HIST 1501"]["title"], "Lost Worlds")
        self.assertEqual(body["counts"]["not_in_catalog"], 1)

    def test_codes_not_checked_in_time_come_back_unticked_and_marked(self):
        async def provider(ids, term):
            if "ECON 2020" in ids:
                await asyncio.sleep(5)
            return {i: CATALOG[i] for i in ids}

        with patch.object(service, "facts_provider", provider), patch.object(service, "FACTS_BUDGET_S", 0.05):
            body = self.upload(UVA).json()
        rows = by_id(body)
        self.assertEqual(len(rows), 6)  # never dropped
        self.assertEqual((rows["ECON 2020"]["checked"], rows["ECON 2020"]["in_catalog"], rows["ECON 2020"]["ticked"]),
                         (False, None, False))
        self.assertEqual(rows["ECON 2020"]["grade"], "CR")
        self.assertTrue(rows["ECON 2010"]["ticked"])
        self.assertEqual(body["counts"]["not_checked"], 1)

    # -- limits and errors ---------------------------------------------------

    def test_sign_in_required(self):
        self.app.dependency_overrides.clear()
        response = self.upload(UVA)
        self.assertIn(response.status_code, (401, 403))
        self.assertEqual(self.provider_calls, [])

    def test_only_pdf_docx_and_txt(self):
        self.assert_error(self.upload(b"\x89PNG....", "scan.png", "image/png"), 415, "unsupported_type")
        self.assert_error(self.upload(b"data", "transcript.exe", "application/octet-stream"), 415, "unsupported_type")
        self.assert_error(self.upload(b"<html></html>", "t.html", "text/html"), 415, "unsupported_type")

    def test_over_ten_megabytes_is_413_without_trusting_the_size_header(self):
        big = b"ECON 2010 Micro 3.0 A\n" * (10 * 1024 * 1024 // 22 + 10)
        self.assertGreater(len(big), routes.TRANSCRIPT_MAX_BYTES)
        self.assert_error(self.upload(big), 413, "too_large")

        # A chunked body has no Content-Length; it is still cut off.
        def chunks():
            for _ in range(12):
                yield b"x" * (1024 * 1024)

        response = self.client.post("/api/planner/transcript", content=chunks(),
                                    headers={"Content-Type": "multipart/form-data; boundary=abc"})
        self.assert_error(response, 413, "too_large")

        # The read stops at the cap: a body that never ends is not read to its end.
        read = 0

        async def endless():
            nonlocal read
            while True:
                read += 1
                yield b"x" * (1024 * 1024)

        request = SimpleNamespace(headers={"content-length": "10"}, stream=endless)
        with self.assertRaises(routes.HTTPException) as ctx:
            asyncio.run(routes._read_capped(request, routes.TRANSCRIPT_MAX_BYTES))
        self.assertEqual((ctx.exception.status_code, read), (413, 11))

    def test_just_under_the_cap_is_read(self):
        line = b"ECON 2010 Micro 3.0 A\n"
        data = line * ((routes.TRANSCRIPT_MAX_BYTES - 100) // len(line))
        response = self.upload(data)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(list(by_id(response.json())), ["ECON 2010"])

    def test_pdf_over_forty_pages_is_422(self):
        self.assert_error(self.upload(blank_pdf(41), "long.pdf", "application/pdf"), 422, "too_many_pages")
        # Forty blank pages are within the cap, but there is no text to read.
        self.assert_error(self.upload(blank_pdf(40), "blank.pdf", "application/pdf"), 422, "unreadable")

    def test_unreadable_files_are_422_without_the_extractor_message(self):
        cases = [
            (blank_pdf(1, password="secret"), "locked.pdf", "application/pdf"),
            (b"%PDF-1.4 not really a pdf", "broken.pdf", "application/pdf"),
            (b"PK not a zip", "broken.docx", DOCX_TYPE),
            (b"   \n  ", "empty.txt", "text/plain"),
        ]
        for data, filename, content_type in cases:
            with self.subTest(filename=filename):
                response = self.upload(data, filename, content_type)
                self.assert_error(response, 422, "unreadable")
                self.assertNotIn("pycryptodome", response.text.lower())

    def test_no_file_is_422(self):
        response = self.client.post("/api/planner/transcript", data={"other": "x"})
        self.assert_error(response, 422, "no_file")
        response = self.client.post("/api/planner/transcript", content=b"ECON 2010",
                                    headers={"Content-Type": "text/plain"})
        self.assert_error(response, 422, "no_file")

    # -- privacy -------------------------------------------------------------

    def test_nothing_written_to_disk(self):
        # Over 1 MB, past Starlette's default spool size, and a DOCX, which
        # the extractor used to write to a temp file.
        padding = "\n".join(f"Line {i} of nothing in particular" for i in range(40000))
        big_docx = docx_bytes(UW + padding)
        self.assertGreater(len(big_docx), 1024 * 1024)

        def refuse(*args, **kwargs):
            raise AssertionError("a temporary file was created")

        with patch.object(tempfile, "TemporaryFile", refuse), \
                patch.object(tempfile, "NamedTemporaryFile", refuse), \
                patch.object(tempfile, "mkstemp", refuse), \
                patch.object(tempfile, "mkdtemp", refuse):
            response = self.upload(big_docx, "transcript.docx", DOCX_TYPE)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertIn("COMP SCI 300", by_id(response.json()))
            big_txt = (UVA + padding).encode()
            self.assertGreater(len(big_txt), 1024 * 1024)
            self.assertEqual(self.upload(big_txt).status_code, 200)

    def test_no_codes_titles_or_filenames_in_logs(self):
        async def provider(ids, term):
            if "ECON 2020" in ids:
                await asyncio.sleep(5)
            if "MATH 1310" in ids:
                raise RuntimeError("lookup failed for MATH 1310")
            return {i: CATALOG.get(i) or CourseFacts(identifier=i, known="no") for i in ids}

        with patch.object(service, "facts_provider", provider), patch.object(service, "FACTS_BUDGET_S", 0.05), \
                self.assertLogs(level=logging.DEBUG) as logs:
            response = self.upload(UVA, "pierce-transcript-secret.txt")
            self.upload(b"\x00garbage", "other-secret.pdf", "application/pdf")
        self.assertEqual(response.status_code, 200)
        text = "\n".join(record.getMessage() + repr(vars(record)) for record in logs.records)
        for secret in ("ECON", "MATH", "STAT", "1310", "2010", "Microeconomics", "secret", "Test Student"):
            self.assertNotIn(secret, text)
        lines = [r.getMessage() for r in logs.records if r.getMessage().startswith("planner transcript")]
        self.assertEqual(len(lines), 2)
        self.assertIn("outcome=ok", lines[0])
        self.assertIn("'rows': 6", lines[0])
        self.assertIn("outcome=unreadable", lines[1])


class ScanTests(unittest.TestCase):
    def test_eligibility_table(self):
        ticked = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "AB", "BC", "P", "S", "CR"]
        unticked = ["F", "W", "WF", "WP", "NC", "U", "I", "INC", "IP", ""]
        lines = [f"ECON {2000 + i} Course {i} 3.0 {grade}" for i, grade in enumerate(ticked + unticked)]
        rows = transcript.collapse(transcript.scan("\n".join(lines), ["ECON"]))
        facts = {r.id: course(r.id) for r in rows}
        body = transcript.rows_for(rows, facts)
        result = {r["grade"] or "": r["ticked"] for r in body["rows"]}
        self.assertEqual(result, {**{g: True for g in ticked}, **{g: False for g in unticked}})
        # A typographic minus reads as a hyphen.
        (row,) = transcript.scan("ECON 3010 Micro 3.0 B−", ["ECON"])
        self.assertEqual(row.grade, "B-")

    def test_repeats_keep_the_latest_passing_attempt(self):
        text = "\n".join([
            "Fall 2024", "ECON 2010 Micro 3.0 B",
            "Spring 2025", "ECON 2010 Micro 3.0 F",
            "Fall 2025", "ECON 2010 Micro 3.0 W",
            "MATH 1310 Calc 4.0 F", "Spring 2026", "MATH 1310 Calc 4.0 WF",
        ])
        rows = {r.id: r for r in transcript.collapse(transcript.scan(text, ["ECON", "MATH"]))}
        self.assertEqual((rows["ECON 2010"].grade, rows["ECON 2010"].term), ("B", "Fall 2024"))
        self.assertEqual((rows["MATH 1310"].grade, rows["MATH 1310"].term), ("WF", "Spring 2026"))

    def test_credits(self):
        cases = {
            "ECON 2010 Micro 3.0 A": 3.0,
            "ECON 2010 Micro A 4.5": 4.5,
            "ECON 2010 Micro 3.00 3.00 11.10 A-": 3.0,  # attempted, earned, quality points
            "ECON 2010 Computer Science 1 4.0 A": 4.0,
            "ECON 2010 Micro 13.0 A": None,  # outside 0-12
            "ECON 2010 Micro A": None,
        }
        for line, credits in cases.items():
            with self.subTest(line=line):
                (row,) = transcript.scan(line, ["ECON"])
                self.assertEqual(row.credits, credits)
        (row,) = transcript.scan("ECON 2010 Computer Science 1 4.0 A", ["ECON"])
        self.assertEqual(row.title, "Computer Science 1")

    def test_known_subjects_avoid_false_matches(self):
        text = "\n".join([
            "FALL 2024", "TOTAL CREDITS 120", "STUDENT ID 1234", "Page 1 of 2", "ROOM 1010 SUITE 200",
            "SCI 300 is not a subject here",  # an unknown subject with no grade or credits
            "COMP SCI 300 PROGRAMMING II 3.00 A",
            "3.00 A MATH 221 CALCULUS 5.00 B",
        ])
        rows = transcript.scan(text, ["COMP SCI", "MATH"])
        self.assertEqual([r.id for r in rows], ["COMP SCI 300", "MATH 221"])
        # Without the list, the longest subject-shaped run before the number.
        self.assertEqual([r.id for r in transcript.scan("COMP SCI 300 PROGRAMMING II 3.00 A")], ["COMP SCI 300"])
        self.assertEqual([r.id for r in transcript.scan("CS2100 Data Structures 4.0 A")], ["CS 2100"])

    def test_known_subjects_from_program_files(self):
        self.assertEqual(transcript.known_subjects(PROGRAMS),
                         ["APPM", "COMP SCI", "CSCI", "E M A", "ECON", "MATH", "STAT"])


if __name__ == "__main__":
    unittest.main()
