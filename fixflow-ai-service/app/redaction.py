from __future__ import annotations

import re
from typing import Any


_ASSIGNMENT = re.compile(
    r"\b(authorization|proxy-authorization|x-api-key|set-cookie|cookie|"
    r"password|passwd|access[_ -]?token|refresh[_ -]?token|session[_ -]?token|"
    r"token|api[_ -]?key|client[_ -]?secret)\b\s*[:=]\s*"
    r'(?:"[^"]*"|\'[^\']*\'|[^\s,;]+)',
    re.IGNORECASE,
)
_HEADER = re.compile(
    r"\b(authorization|proxy-authorization|x-api-key)\b\s*[:=]\s*"
    r"(?:bearer\s+)?[^\s,;]+",
    re.IGNORECASE,
)
_EMAIL = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
_IP = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")
_JWT = re.compile(
    r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]+)?\b"
)


def redact_text(value: str) -> str:
    value = _HEADER.sub(r"\1: [REDACTED]", value)
    value = _ASSIGNMENT.sub(r"\1=[REDACTED]", value)
    value = re.sub(r"\bBearer\s+[A-Za-z0-9._~+/-]+=*", "Bearer [REDACTED]", value, flags=re.I)
    value = re.sub(r"\bffk_live_[A-Za-z0-9_-]+\b", "[REDACTED_API_KEY]", value)
    value = _JWT.sub("[REDACTED_TOKEN]", value)
    value = re.sub(
        r"([?&](?:password|passwd|secret|(?:access|refresh|session)?[_-]?token|"
        r"api[_-]?key|authorization|email|phone|user[_-]?id)=)[^&#\s]*",
        r"\1[REDACTED]",
        value,
        flags=re.I,
    )
    value = _IP.sub("[REDACTED_IP]", value)
    return _EMAIL.sub("[REDACTED_EMAIL]", value)


_SENSITIVE_KEY = re.compile(
    r"(?:password|passwd|secret|token|api[_-]?key|authorization|cookie|"
    r"e-?mail|phone|ssn|ip(?:address)?|user[_-]?(?:id|name)|"
    r"customer[_-]?(?:id|name))",
    re.IGNORECASE,
)


def sanitize_json(value: Any, depth: int = 0) -> Any:
    if isinstance(value, str):
        return redact_text(value)[:2000]
    if isinstance(value, (int, float, bool)) or value is None:
        return value
    if depth >= 4:
        return None
    if isinstance(value, list):
        return [sanitize_json(item, depth + 1) for item in value[:50]]
    if isinstance(value, dict):
        return {
            str(key)[:100]: sanitize_json(item, depth + 1)
            for key, item in list(value.items())[:50]
            if not _SENSITIVE_KEY.search(str(key))
        }
    return None
