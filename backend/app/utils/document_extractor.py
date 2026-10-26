from io import BytesIO
import PyPDF2
import tempfile
import docx2txt
import os


def extract_text_from_file(file_bytes: bytes, content_type: str) -> str:
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
        return "\n".join(page.extract_text() for page in reader.pages if page.extract_text())

    elif content_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name
        try:
            return docx2txt.process(tmp_path)
        finally:
            os.unlink(tmp_path)  # Clean up temp file

    elif content_type == "text/plain":
        return file_bytes.decode("utf-8")

    else:
        raise ValueError("Unsupported file type.")
