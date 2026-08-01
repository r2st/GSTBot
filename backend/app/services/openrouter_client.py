"""The single entry point every AI feature calls.

Free-tier models only, over plain httpx — no SDK, no hidden global state, so
tests mock one function. Two provider quirks shape this module:

* The free reasoning models (``openai/gpt-oss-20b:free`` in particular) often
  return ``content: null`` with the answer parked in ``reasoning``. The client
  falls back to that field rather than crashing on ``None``.
* Free models ignore ``response_format`` about as often as they honour it, so
  callers ask for JSON in the prompt and :func:`extract_json_object` digs the
  object out of whatever prose or markdown fence it arrives wrapped in.

Every caller is expected to handle :class:`OpenRouterError` by falling back to
something deterministic. A free tier is a free tier: it rate-limits, and an
invoice upload must not fail because a model was busy.
"""
from __future__ import annotations

import base64
import json
import logging
import re
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


class OpenRouterError(RuntimeError):
    """Raised when no completion could be obtained."""


def is_configured() -> bool:
    """Whether an API key is present. Callers skip the round trip without one."""
    return bool(settings.openrouter_api_key)


def extract_json_object(raw: str) -> dict[str, Any] | None:
    """Pull the first JSON object out of a model response, or ``None``.

    Tolerates markdown fences and surrounding prose — including a reasoning
    model's scratchpad, which is why asking for JSON is the reliable way to get
    structured data out of the free tier.
    """
    if not raw:
        return None
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip(), flags=re.S)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        return None
    try:
        parsed = json.loads(text[start : end + 1])
    except (ValueError, TypeError):
        return None
    return parsed if isinstance(parsed, dict) else None


def image_data_url(content: bytes, content_type: str = "image/jpeg") -> str:
    """Encode image bytes as a data URL for the vision message format."""
    encoded = base64.b64encode(content).decode("ascii")
    return f"data:{content_type};base64,{encoded}"


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
        # OpenRouter attributes free-tier usage to the referring app.
        "HTTP-Referer": settings.openrouter_app_url,
        "X-Title": settings.openrouter_app_title,
    }


def _message_text(choice: dict[str, Any]) -> str:
    message = choice.get("message") or {}
    content = message.get("content")
    if isinstance(content, list):
        # Some models return content as a list of typed parts.
        content = "".join(part.get("text", "") for part in content if isinstance(part, dict))
    if content:
        return str(content).strip()
    # Reasoning models park the whole answer here when content comes back null.
    return str(message.get("reasoning") or "").strip()


def chat_completion(
    messages: list[dict[str, Any]],
    *,
    model: str | None = None,
    temperature: float = 0.1,
    max_tokens: int = 1500,
    timeout: float | None = None,
) -> str:
    """Return the assistant's text for *messages*.

    ``messages`` follows the OpenAI chat format; a vision call passes a list of
    content parts instead of a string. Raises :class:`OpenRouterError` when no
    key is configured or the request fails — the caller's cue to fall back.
    """
    if not is_configured():
        raise OpenRouterError("OPENROUTER_API_KEY is not set")

    payload = {
        "model": model or settings.openrouter_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    try:
        response = httpx.post(
            f"{settings.openrouter_base_url.rstrip('/')}/chat/completions",
            headers=_headers(),
            json=payload,
            timeout=timeout or settings.openrouter_timeout_seconds,
        )
    except httpx.HTTPError as exc:
        raise OpenRouterError(f"OpenRouter request failed: {exc}") from exc

    if response.status_code >= 400:
        raise OpenRouterError(
            f"OpenRouter returned {response.status_code}: {response.text[:500]}"
        )

    try:
        data = response.json()
    except ValueError as exc:
        raise OpenRouterError("OpenRouter returned a non-JSON body") from exc

    choices = data.get("choices") or []
    if not choices:
        raise OpenRouterError(f"OpenRouter returned no choices: {str(data)[:300]}")

    text = _message_text(choices[0])
    if not text:
        raise OpenRouterError("OpenRouter returned an empty completion")
    return text


def chat_json(
    messages: list[dict[str, Any]],
    *,
    model: str | None = None,
    max_tokens: int = 1500,
    timeout: float | None = None,
) -> dict[str, Any]:
    """Run a completion and return the JSON object in it.

    Temperature is pinned to 0 — every JSON caller in this product is doing
    extraction, where the same invoice should give the same answer twice.
    """
    raw = chat_completion(
        messages, model=model, temperature=0.0, max_tokens=max_tokens, timeout=timeout
    )
    parsed = extract_json_object(raw)
    if parsed is None:
        raise OpenRouterError(f"No JSON object in model response: {raw[:300]}")
    return parsed
