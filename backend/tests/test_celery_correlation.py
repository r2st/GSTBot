"""The correlation id surviving the trip through the broker.

An invoice upload is answered before it is parsed, so the interesting half of
its story — the model call, the retry, the failure — happens in a worker
process on the other side of Redis. Without this propagation those lines carry
a different id, and "my April upload failed" is only traceable as far as the
enqueue.

The signal handlers are exercised directly rather than through a live broker:
what is being asserted is the contract between publish and consume, and a real
Redis would test Celery's transport rather than this code.
"""
from __future__ import annotations

import pytest

from app.celery_app import (
    CORRELATION_HEADER,
    _attach_correlation_id,
    _bind_task_correlation_id,
    _clear_task_correlation_id,
)
from app.core.logging import bind_correlation_id, get_correlation_id, set_correlation_id


@pytest.fixture(autouse=True)
def _clean_context():
    set_correlation_id("")
    yield
    set_correlation_id("")


class _FakeRequest:
    """Stands in for ``task.request``, which is where protocol-2 headers land."""

    def __init__(self, **attrs):
        for key, value in attrs.items():
            setattr(self, key, value)


class _FakeTask:
    def __init__(self, request=None):
        self.request = request


class TestPublishSide:
    def test_the_current_requests_id_is_stamped_on_the_message(self):
        bind_correlation_id("upload-abc")
        headers = {}
        _attach_correlation_id(headers=headers)
        assert headers[CORRELATION_HEADER] == "upload-abc"

    def test_publishing_outside_a_request_still_gets_an_id(self):
        # A beat schedule or a shell has no HTTP edge to inherit from, and an
        # anonymous worker line is the thing this module exists to prevent.
        headers = {}
        _attach_correlation_id(headers=headers)
        assert len(headers[CORRELATION_HEADER]) == 16

    def test_an_id_already_on_the_message_is_not_overwritten(self):
        # A retry re-publishes; it must stay part of the original story.
        bind_correlation_id("new-request")
        headers = {CORRELATION_HEADER: "original-request"}
        _attach_correlation_id(headers=headers)
        assert headers[CORRELATION_HEADER] == "original-request"

    def test_no_headers_mapping_is_survived(self):
        # Celery calls this signal with headers=None on some paths; raising
        # here would fail the enqueue and lose the invoice.
        _attach_correlation_id(headers=None)

    def test_other_header_keys_are_left_alone(self):
        headers = {"lang": "py", "task": "invoices.parse"}
        _attach_correlation_id(headers=headers)
        assert headers["task"] == "invoices.parse"


class TestConsumeSide:
    def test_the_id_from_the_message_is_bound_for_the_task(self):
        task = _FakeTask(_FakeRequest(**{CORRELATION_HEADER: "upload-abc"}))
        _bind_task_correlation_id(task=task)
        assert get_correlation_id() == "upload-abc"

    def test_a_message_without_an_id_still_gets_one(self):
        # An older message enqueued before this code shipped, or one published
        # by something else entirely.
        _bind_task_correlation_id(task=_FakeTask(_FakeRequest()))
        assert len(get_correlation_id()) == 16

    def test_a_task_with_no_request_does_not_raise(self):
        _bind_task_correlation_id(task=_FakeTask(None))
        assert len(get_correlation_id()) == 16

    def test_no_task_at_all_does_not_raise(self):
        _bind_task_correlation_id(task=None)
        assert len(get_correlation_id()) == 16

    def test_a_hostile_id_from_the_broker_is_replaced(self):
        # The id originated in a client header. It reached the broker as data,
        # and it is about to be written into a log line.
        task = _FakeTask(_FakeRequest(**{CORRELATION_HEADER: "abc\nERROR forged"}))
        _bind_task_correlation_id(task=task)
        bound = get_correlation_id()
        assert "\n" not in bound
        assert bound != "abc\nERROR forged"

    def test_the_id_is_cleared_between_tasks(self):
        # A worker process is long-lived and reuses the context; a leaked id
        # would attribute the next task's lines to an unrelated upload.
        _bind_task_correlation_id(task=_FakeTask(_FakeRequest(**{CORRELATION_HEADER: "first"})))
        _clear_task_correlation_id()
        assert get_correlation_id() == ""


class TestRoundTrip:
    def test_an_id_bound_at_the_edge_reaches_the_worker(self):
        """The whole point, end to end across the broker boundary."""
        # 1. A request arrives and binds its id.
        bind_correlation_id("request-9f2c")

        # 2. The route enqueues; Celery calls the publish signal.
        headers = {}
        _attach_correlation_id(headers=headers)

        # 3. The request ends and its context goes away.
        set_correlation_id("")
        assert get_correlation_id() == ""

        # 4. A worker picks the message up in a different process.
        task = _FakeTask(_FakeRequest(**headers))
        _bind_task_correlation_id(task=task)

        assert get_correlation_id() == "request-9f2c"

    def test_two_tasks_do_not_bleed_into_each_other(self):
        first = _FakeTask(_FakeRequest(**{CORRELATION_HEADER: "upload-1"}))
        second = _FakeTask(_FakeRequest(**{CORRELATION_HEADER: "upload-2"}))

        _bind_task_correlation_id(task=first)
        assert get_correlation_id() == "upload-1"
        _clear_task_correlation_id()

        _bind_task_correlation_id(task=second)
        assert get_correlation_id() == "upload-2"


class TestCeleryConfiguration:
    def test_the_worker_keeps_our_logging(self):
        # Celery installs its own handlers unless the setup_logging signal has
        # a receiver; letting it would drop the correlation id from every
        # worker line and give the worker a different format from the API.
        from celery.signals import setup_logging

        assert setup_logging.receivers

    def test_deadlines_are_computed_in_ist(self):
        # Every due date this product tracks is an Indian statutory one.
        from app.celery_app import celery_app

        assert celery_app.conf.timezone == "Asia/Kolkata"

    def test_only_json_is_accepted_off_the_broker(self):
        # Pickle would make anything that can write to Redis able to execute
        # code in the worker.
        from app.celery_app import celery_app

        assert celery_app.conf.accept_content == ["json"]

    def test_a_task_is_acknowledged_only_after_it_runs(self):
        # A worker killed mid-parse must leave the invoice re-queued rather
        # than silently unparsed.
        from app.celery_app import celery_app

        assert celery_app.conf.task_acks_late is True
