"""Criterion: A especial foi renomeada para "Invocação do Xande" em todas as superfícies.

GET /api/live/config returns rules_version 9 and action_name "Invocação do Xande" for the
hammer gift rule, while damage stays at 150. The demo gift endpoint mirrors the same
action_name for a mocked (DEMO) gift event.
"""
import uuid

import httpx

BASE_URL = "http://localhost:8001/api/live"


def test_config_reports_v9_and_renamed_hammer_action():
    with httpx.Client(timeout=10) as client:
        resp = client.get(f"{BASE_URL}/config")
        assert resp.status_code == 200, resp.text
        config = resp.json()

        assert config["rules_version"] == 9, config

        hammer = next((r for r in config["rules"] if r["gift_id"] == "hammer"), None)
        assert hammer is not None, config["rules"]
        assert hammer["action_name"] == "Invocação do Xande", hammer
        assert hammer["damage"] == 150, hammer


def test_demo_gift_hammer_mirrors_renamed_action():
    with httpx.Client(timeout=10) as client:
        event_id = f"tscheck-hammer-rename-{uuid.uuid4().hex[:8]}"
        resp = client.post(
            f"{BASE_URL}/demo/gift",
            json={
                "event_id": event_id,
                "gift_id": "hammer",
                "username": "tscheck_user",
                "quantity": 1,
                "benefited_character": "lula",
            },
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["event_id"] == event_id, body
        assert body["damage"] == 150, body
