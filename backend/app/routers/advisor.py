"""AI GST advisor — proxies the Gemini API so the frontend avoids CORS.

Public and stateless: the endpoint accepts a conversation history and returns
the model's next reply. The API key lives server-side, so it never reaches
the browser.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.core.rate_limit import RateLimit

logger = logging.getLogger(__name__)

router = APIRouter(tags=["advisor"])

_advisor_limit = RateLimit("advisor_ask", "30/minute", by="ip")

_GEMINI_MODEL = "gemini-3.8-flash"
_GEMINI_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/{_GEMINI_MODEL}:generateContent"
)

SYSTEM_PROMPT = (
    "You are GSTIndia AI Advisor, an expert on India's Goods and Services Tax. "
    "Help users with GST registration, GSTR-1/GSTR-3B/GSTR-9 filing, HSN and SAC codes, "
    "input tax credit (ITC) eligibility and reconciliation, composition scheme rules, "
    "e-way bill requirements, reverse charge mechanism, GST rates for goods and services, "
    "inter-state vs intra-state supply, TDS/TCS under GST, refund procedures, "
    "penalties and interest for late filing, and general GST compliance for Indian SMBs. "
    "Answer concisely and accurately. Cite relevant sections of the CGST/SGST/IGST Acts "
    "when applicable. If a question is outside GST or Indian tax law, politely decline "
    "and redirect to GST topics. Use simple language suited for small business owners."
)

_KEY_FILE = Path("/opt/GSTBot/keys/gemini-api-key")


def _get_api_key() -> str | None:
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if key:
        return key
    try:
        key = _KEY_FILE.read_text().strip()
        if key:
            return key
    except OSError:
        pass
    return None


class HistoryMessage(BaseModel):
    role: str = Field(max_length=20)
    text: str = Field(max_length=4000)


class AdvisorRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[HistoryMessage] = Field(default_factory=list, max_length=50)


def _build_contents(history: list[HistoryMessage], message: str) -> list[dict]:
    contents: list[dict] = [
        {"role": "user", "parts": [{"text": SYSTEM_PROMPT}]},
        {"role": "model", "parts": [{"text": "Understood. I'm your GST advisor. How can I help?"}]},
    ]
    for m in history:
        contents.append({
            "role": "user" if m.role == "user" else "model",
            "parts": [{"text": m.text}],
        })
    contents.append({"role": "user", "parts": [{"text": message}]})
    return contents


@router.post(
    "/advisor/ask",
    summary="Ask the GST AI Advisor a question",
    description=(
        "Proxies a question to the Gemini model with a GST-expert system prompt. "
        "Accepts the current message and conversation history. Public — called "
        "from the chatbot widget before and after sign-in."
    ),
    dependencies=[Depends(_advisor_limit)],
)
async def ask_advisor(body: AdvisorRequest) -> dict[str, str]:
    api_key = _get_api_key()
    if not api_key:
        return {"reply": "The AI advisor is temporarily unavailable. Please try again later."}

    contents = _build_contents(body.history, body.message)
    payload = {
        "contents": contents,
        "generationConfig": {"maxOutputTokens": 1024, "temperature": 0.7},
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                _GEMINI_URL,
                params={"key": api_key},
                json=payload,
            )
        if response.status_code != 200:
            logger.warning(
                "Gemini API returned %d: %s",
                response.status_code,
                response.text[:200],
            )
            return {"reply": "Sorry, I could not generate a response. Please try again."}

        data = response.json()
        reply = (
            data.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text", "Sorry, I could not generate a response.")
        )
        return {"reply": reply}

    except httpx.TimeoutException:
        return {"reply": "The request timed out. Please try again."}
    except Exception:
        logger.exception("Advisor proxy error")
        return {"reply": "Something went wrong. Please try again later."}
