from io import BytesIO
from typing import Optional

import PyPDF2
import docx2txt


class TooManyPages(ValueError):
    """A PDF longer than the caller's ``max_pages``."""


def extract_text_from_file(file_bytes: bytes, content_type: str, *, max_pages: Optional[int] = None) -> str:
    """Text of a PDF, DOCX or TXT file, read in memory (nothing is written to disk).

    ``max_pages`` rejects a longer PDF with ``TooManyPages`` before any page is read.
    """
    if content_type == "application/pdf":
        reader = PyPDF2.PdfReader(BytesIO(file_bytes))
        if getattr(reader, "is_encrypted", False):
            # Many registrar PDFs use owner-password / empty-user AES encryption.
            try:
                reader.decrypt("")
            except Exception as exc:
                message = str(exc)
                if "PyCryptodome" in message or "pycryptodome" in message.lower():
                    raise ValueError(
                        "This PDF is encrypted. Install pycryptodome "
                        "(already listed in requirements.txt) and restart the backend, "
                        "or upload a TXT/DOCX copy of your transcript."
                    ) from exc
                raise ValueError(
                    "This PDF is password-protected and could not be opened. "
                    "Export an unencrypted PDF or upload a TXT/DOCX transcript."
                ) from exc
        if max_pages is not None and len(reader.pages) > max_pages:
            raise TooManyPages(f"This PDF has more than {max_pages} pages.")
        return "\n".join(page.extract_text() for page in reader.pages if page.extract_text())

    elif content_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        # docx2txt opens its argument with zipfile.ZipFile, which takes a file
        # object, so the document never touches disk (setup-dialog R8).
        return docx2txt.process(BytesIO(file_bytes))

    elif content_type == "text/plain":
        return file_bytes.decode("utf-8")

    else:
        raise ValueError("Unsupported file type.")
