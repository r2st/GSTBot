"""The model client, and the free-tier misbehaviour it exists to absorb.

Every AI feature in the product goes through this module, and the reason it is
hand-rolled over httpx rather than an SDK is that the free tier does not keep
the contract an SDK assumes. Three things go wrong constantly and all three
must be survivable, because an invoice upload cannot fail just because a free
model was busy or chatty:

*   ``content`` comes back ``null`` with the real answer parked in
    ``reasoning``. Reading ``content`` alone gets ``None`` and a crash.
*   ``response_format`` is ignored, so JSON arrives wrapped in prose, a
    markdown fence, or a reasoning model's scratchpad.
*   The endpoint rate-limits, times out, or answers with an HTML error page.

Every failure here must arrive as OpenRouterError specifically, because that
is the exception every caller catches to fall back to the deterministic path.
An httpx exception escaping this module would take the upload down with it.

The transport is stubbed rather than dialled: what is under test is this
module's reading of a response, not httpx's ability to make a request.
"""
from __future__ import annotations

import json

import httpx
import pytest

from app.core.config import settings
from app.services import openrouter_client
from app.services.openrouter_client import (
    OpenRouterError,
    chat_completion,
    chat_json,
    extract_json_object,
    image_data_url,
    is_configured,
)

MESSAGES = [{"role": "user", "content": "Read this invoice"}]


class _FakeResponse:
    def __init__(self, status_code=200, payload=None, text=None):
        self.status_code = status_code
        self._payload = payload
        self.text = text if text is not None else json.dumps(payload)

    def json(self):
        if self._payload is None:
            raise ValueError("not JSON")
        return self._payload


@pytest.fixture()
def configured(monkeypatch):
    monkeypatch.setattr(settings, "openrouter_api_key", "test-key")
    return settings


@pytest.fixture()
def transport(monkeypatch):
    """Script the HTTP layer and capture what was sent to it."""
    calls: list[dict] = []
    state: dict = {"response": _FakeResponse(payload=_completion("ok")), "raises": None}

    def fake_post(url, **kwargs):
        calls.append({"url": url, **kwargs})
        if state["raises"] is not None:
            raise state["raises"]
        return state["response"]

    monkeypatch.setattr(httpx, "post", fake_post)
    return {"calls": calls, "state": state}


def _completion(content, *, reasoning=None):
    message: dict = {"content": content}
    if reasoning is not None:
        message["reasoning"] = reasoning
    return {"choices": [{"message": message}]}


# --------------------------------------------------------------------------
# is_configured
# --------------------------------------------------------------------------

class TestIsConfigured:
    def test_true_with_a_key(self, monkeypatch):
        monkeypatch.setattr(settings, "openrouter_api_key", "sk-test")
        assert is_configured() is True

    @pytest.mark.parametrize("value", ["", None])
    def test_false_without_one(self, monkeypatch, value):
        monkeypatch.setattr(settings, "openrouter_api_key", value)
        assert is_configured() is False


# --------------------------------------------------------------------------
# extract_json_object
# --------------------------------------------------------------------------

class TestExtractJsonObject:
    def test_a_bare_object(self):
        assert extract_json_object('{"invoice_number": "INV-1"}') == {"invoice_number": "INV-1"}

    def test_a_fenced_object(self):
        raw = '```json\n{"invoice_number": "INV-1"}\n```'
        assert extract_json_object(raw) == {"invoice_number": "INV-1"}

    def test_an_unlabelled_fence(self):
        assert extract_json_object('```\n{"a": 1}\n```') == {"a": 1}

    def test_surrounding_prose_is_ignored(self):
        raw = 'Sure! Here is the data you asked for:\n{"a": 1}\nLet me know if you need more.'
        assert extract_json_object(raw) == {"a": 1}

    def test_a_reasoning_scratchpad_before_the_answer(self):
        # The shape that motivated this function: the model thinks out loud,
        # mentions braces in passing, then answers.
        raw = (
            "Let me work through this. The taxable value is 450000 and the rate "
            "is 18%, so IGST is 81000.\n\nFinal answer:\n"
            '{"taxable_value": 450000, "igst": 81000}'
        )
        assert extract_json_object(raw) == {"taxable_value": 450000, "igst": 81000}

    def test_nested_objects_survive(self):
        raw = '{"supplier": {"gstin": "29AAGCB7383J1Z4"}, "total": 531000}'
        assert extract_json_object(raw)["supplier"]["gstin"] == "29AAGCB7383J1Z4"

    def test_the_outermost_object_wins_when_prose_follows(self):
        # find("{") to rfind("}") spans the whole object, not the first brace
        # pair, which would truncate any nested structure.
        raw = 'Answer: {"a": {"b": 1}, "c": 2}'
        assert extract_json_object(raw) == {"a": {"b": 1}, "c": 2}

    @pytest.mark.parametrize(
        "raw",
        [
            "",
            "   ",
            "I could not read this invoice.",
            "{",
            "}{",
            "{not valid json at all}",
            '{"unterminated": ',
        ],
    )
    def test_unusable_responses_return_none(self, raw):
        assert extract_json_object(raw) is None

    def test_a_single_object_wrapped_in_an_array_is_unwrapped(self):
        # The brace scan reaches past the brackets, so a model that answers
        # with a one-element list still yields a usable invoice rather than a
        # failed extraction. Worth pinning: it is the scan's behaviour, not an
        # intention expressed anywhere in the code.
        assert extract_json_object('[{"a": 1}]') == {"a": 1}

    def test_an_array_of_several_objects_is_rejected(self):
        # Slicing first-brace to last-brace across two objects produces
        # something that is not valid JSON, so this fails closed rather than
        # silently returning one of two invoices.
        assert extract_json_object('[{"a": 1}, {"a": 2}]') is None

    def test_a_json_scalar_is_rejected(self):
        assert extract_json_object("42") is None

    def test_an_empty_object_is_returned_not_rejected(self):
        # Falsy but valid: "the model found nothing" is a real answer and is
        # different from "the model did not answer in JSON".
        assert extract_json_object("{}") == {}


# --------------------------------------------------------------------------
# image_data_url
# --------------------------------------------------------------------------

class TestImageDataUrl:
    def test_builds_a_data_url(self):
        assert image_data_url(b"abc", "image/png") == "data:image/png;base64,YWJj"

    def test_defaults_to_jpeg(self):
        assert image_data_url(b"abc").startswith("data:image/jpeg;base64,")

    def test_empty_content_still_produces_a_url(self):
        assert image_data_url(b"") == "data:image/jpeg;base64,"

    def test_binary_content_is_ascii_safe(self):
        # The result goes into a JSON body; a raw byte would break encoding.
        url = image_data_url(bytes(range(256)), "image/webp")
        url.encode("ascii")


# --------------------------------------------------------------------------
# chat_completion — the request
# --------------------------------------------------------------------------

class TestChatCompletionRequest:
    def test_no_key_means_no_round_trip(self, monkeypatch, transport):
        monkeypatch.setattr(settings, "openrouter_api_key", "")
        with pytest.raises(OpenRouterError, match="OPENROUTER_API_KEY"):
            chat_completion(MESSAGES)
        assert transport["calls"] == [], "asked the network without a key"

    def test_the_key_is_sent_as_a_bearer_token(self, configured, transport):
        chat_completion(MESSAGES)
        assert transport["calls"][0]["headers"]["Authorization"] == "Bearer test-key"

    def test_attribution_headers_are_sent(self, configured, transport):
        # OpenRouter attributes free-tier usage to these; without them the
        # quota is charged to nobody and the request can be refused.
        chat_completion(MESSAGES)
        headers = transport["calls"][0]["headers"]
        assert headers["HTTP-Referer"] == settings.openrouter_app_url
        assert headers["X-Title"] == settings.openrouter_app_title

    def test_the_configured_model_is_used_by_default(self, configured, transport):
        chat_completion(MESSAGES)
        assert transport["calls"][0]["json"]["model"] == settings.openrouter_model

    def test_an_explicit_model_overrides_the_default(self, configured, transport):
        chat_completion(MESSAGES, model="anthropic/claude-3-haiku")
        assert transport["calls"][0]["json"]["model"] == "anthropic/claude-3-haiku"

    def test_the_url_is_built_without_a_double_slash(self, configured, transport, monkeypatch):
        monkeypatch.setattr(settings, "openrouter_base_url", "https://example.test/api/")
        chat_completion(MESSAGES)
        assert transport["calls"][0]["url"] == "https://example.test/api/chat/completions"

    def test_temperature_and_max_tokens_are_passed_through(self, configured, transport):
        chat_completion(MESSAGES, temperature=0.7, max_tokens=42)
        body = transport["calls"][0]["json"]
        assert body["temperature"] == 0.7
        assert body["max_tokens"] == 42

    def test_the_configured_timeout_is_applied(self, configured, transport):
        chat_completion(MESSAGES)
        assert transport["calls"][0]["timeout"] == settings.openrouter_timeout_seconds

    def test_an_explicit_timeout_overrides_it(self, configured, transport):
        chat_completion(MESSAGES, timeout=3.5)
        assert transport["calls"][0]["timeout"] == 3.5

    def test_the_messages_are_sent_verbatim(self, configured, transport):
        # A vision call passes a list of content parts; nothing here may
        # reshape it.
        vision = [{"role": "user", "content": [{"type": "text", "text": "hi"}]}]
        chat_completion(vision)
        assert transport["calls"][0]["json"]["messages"] == vision


# --------------------------------------------------------------------------
# chat_completion — reading the response
# --------------------------------------------------------------------------

class TestChatCompletionResponse:
    def test_returns_the_message_content(self, configured, transport):
        transport["state"]["response"] = _FakeResponse(payload=_completion("  the answer  "))
        assert chat_completion(MESSAGES) == "the answer"

    def test_falls_back_to_reasoning_when_content_is_null(self, configured, transport):
        # gpt-oss-20b:free does this constantly. Reading content alone yields
        # None and the upload dies on a free-tier quirk.
        transport["state"]["response"] = _FakeResponse(
            payload=_completion(None, reasoning="the real answer")
        )
        assert chat_completion(MESSAGES) == "the real answer"

    def test_content_wins_over_reasoning_when_both_are_present(self, configured, transport):
        transport["state"]["response"] = _FakeResponse(
            payload=_completion("the answer", reasoning="scratchpad")
        )
        assert chat_completion(MESSAGES) == "the answer"

    def test_content_delivered_as_typed_parts_is_joined(self, configured, transport):
        transport["state"]["response"] = _FakeResponse(
            payload=_completion(
                [{"type": "text", "text": "part one "}, {"type": "text", "text": "part two"}]
            )
        )
        assert chat_completion(MESSAGES) == "part one part two"

    def test_non_dict_entries_in_a_part_list_are_skipped(self, configured, transport):
        transport["state"]["response"] = _FakeResponse(
            payload=_completion([{"type": "text", "text": "kept"}, "dropped", None])
        )
        assert chat_completion(MESSAGES) == "kept"

    @pytest.mark.parametrize("status", [400, 401, 402, 429, 500, 502, 503])
    def test_an_error_status_becomes_an_openrouter_error(self, configured, transport, status):
        transport["state"]["response"] = _FakeResponse(
            status_code=status, payload={"error": "nope"}
        )
        with pytest.raises(OpenRouterError, match=str(status)):
            chat_completion(MESSAGES)

    def test_an_error_body_is_truncated_in_the_message(self, configured, transport):
        # An HTML error page is a plausible 502 body; the whole page must not
        # end up in the logs on every failed upload.
        transport["state"]["response"] = _FakeResponse(status_code=502, text="x" * 5000)
        with pytest.raises(OpenRouterError) as caught:
            chat_completion(MESSAGES)
        assert len(str(caught.value)) < 600

    def test_a_non_json_body_becomes_an_openrouter_error(self, configured, transport):
        transport["state"]["response"] = _FakeResponse(payload=None, text="<html>502</html>")
        with pytest.raises(OpenRouterError, match="non-JSON"):
            chat_completion(MESSAGES)

    @pytest.mark.parametrize("payload", [{}, {"choices": []}, {"choices": None}])
    def test_no_choices_becomes_an_openrouter_error(self, configured, transport, payload):
        transport["state"]["response"] = _FakeResponse(payload=payload)
        with pytest.raises(OpenRouterError, match="no choices"):
            chat_completion(MESSAGES)

    @pytest.mark.parametrize(
        "payload",
        [
            {"choices": [{"message": {"content": ""}}]},
            {"choices": [{"message": {"content": None}}]},
            {"choices": [{"message": {"content": None, "reasoning": None}}]},
            {"choices": [{"message": {"content": "   "}}]},
            {"choices": [{"message": {}}]},
            {"choices": [{}]},
        ],
    )
    def test_an_empty_completion_becomes_an_openrouter_error(
        self, configured, transport, payload
    ):
        transport["state"]["response"] = _FakeResponse(payload=payload)
        with pytest.raises(OpenRouterError, match="empty completion"):
            chat_completion(MESSAGES)

    @pytest.mark.parametrize(
        "error",
        [
            httpx.ConnectError("connection refused"),
            httpx.ReadTimeout("timed out"),
            httpx.ConnectTimeout("timed out connecting"),
            httpx.RemoteProtocolError("server disconnected"),
        ],
    )
    def test_every_transport_failure_becomes_an_openrouter_error(
        self, configured, transport, error
    ):
        # The contract the whole fallback chain rests on: callers catch
        # OpenRouterError, so an httpx exception escaping here would take the
        # upload down instead of falling back to heuristics.
        transport["state"]["raises"] = error
        with pytest.raises(OpenRouterError, match="request failed"):
            chat_completion(MESSAGES)

    def test_the_original_error_is_chained(self, configured, transport):
        transport["state"]["raises"] = httpx.ReadTimeout("timed out")
        with pytest.raises(OpenRouterError) as caught:
            chat_completion(MESSAGES)
        assert isinstance(caught.value.__cause__, httpx.ReadTimeout)


# --------------------------------------------------------------------------
# chat_json
# --------------------------------------------------------------------------

class TestChatJson:
    def test_returns_the_parsed_object(self, configured, transport):
        transport["state"]["response"] = _FakeResponse(payload=_completion('{"a": 1}'))
        assert chat_json(MESSAGES) == {"a": 1}

    def test_digs_the_object_out_of_a_fence(self, configured, transport):
        transport["state"]["response"] = _FakeResponse(
            payload=_completion('```json\n{"a": 1}\n```')
        )
        assert chat_json(MESSAGES) == {"a": 1}

    def test_reads_json_out_of_the_reasoning_field(self, configured, transport):
        # Both quirks at once, which is the common case for the free tier.
        transport["state"]["response"] = _FakeResponse(
            payload=_completion(None, reasoning='thinking...\n{"a": 1}')
        )
        assert chat_json(MESSAGES) == {"a": 1}

    def test_temperature_is_pinned_to_zero(self, configured, transport):
        # Extraction must be reproducible: the same invoice twice should not
        # produce two different taxable values.
        transport["state"]["response"] = _FakeResponse(payload=_completion('{"a": 1}'))
        chat_json(MESSAGES)
        assert transport["calls"][0]["json"]["temperature"] == 0.0

    def test_a_prose_answer_becomes_an_openrouter_error(self, configured, transport):
        transport["state"]["response"] = _FakeResponse(
            payload=_completion("I'm sorry, I can't read that invoice.")
        )
        with pytest.raises(OpenRouterError, match="No JSON object"):
            chat_json(MESSAGES)

    def test_the_failing_response_is_quoted_but_truncated(self, configured, transport):
        transport["state"]["response"] = _FakeResponse(payload=_completion("no json " * 500))
        with pytest.raises(OpenRouterError) as caught:
            chat_json(MESSAGES)
        assert len(str(caught.value)) < 400

    def test_a_transport_failure_propagates_as_openrouter_error(self, configured, transport):
        transport["state"]["raises"] = httpx.ConnectError("refused")
        with pytest.raises(OpenRouterError):
            chat_json(MESSAGES)

    def test_options_are_forwarded(self, configured, transport):
        transport["state"]["response"] = _FakeResponse(payload=_completion('{"a": 1}'))
        chat_json(MESSAGES, model="some/model", max_tokens=99, timeout=2.0)
        call = transport["calls"][0]
        assert call["json"]["model"] == "some/model"
        assert call["json"]["max_tokens"] == 99
        assert call["timeout"] == 2.0


class TestEveryFailureIsCatchable:
    """One sweep over the whole surface: nothing escapes as another type."""

    @pytest.mark.parametrize(
        "setup",
        [
            {"raises": httpx.ConnectError("refused")},
            {"response": _FakeResponse(status_code=429, payload={"error": "rate limited"})},
            {"response": _FakeResponse(payload=None, text="<html>")},
            {"response": _FakeResponse(payload={"choices": []})},
            {"response": _FakeResponse(payload=_completion(""))},
            {"response": _FakeResponse(payload=_completion("not json"))},
        ],
    )
    def test_chat_json_raises_only_openrouter_error(self, configured, transport, setup):
        transport["state"].update(setup)
        with pytest.raises(OpenRouterError):
            chat_json(MESSAGES)

    def test_openrouter_error_is_a_runtime_error(self):
        # Callers written against RuntimeError still catch it.
        assert issubclass(OpenRouterError, RuntimeError)

    def test_the_module_exposes_what_callers_import(self):
        for name in ("is_configured", "chat_completion", "chat_json", "OpenRouterError"):
            assert hasattr(openrouter_client, name)
