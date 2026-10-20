"""Criterion: Universo TikTok fires a 240-damage Ultra Hadouken per unit; quantity>1 stays
at the same per-unit damage (frontend multiplies units, backend never inflates `damage`)."""
import uuid

import httpx

BASE_URL = "http://localhost:8001/api/live"


def _unique(prefix: str) -> str:
    return f"tscheck-{prefix}-{uuid.uuid4().hex[:8]}"


def test_universe_gift_reports_240_damage_and_ultra_special_move():
    with httpx.Client(timeout=10) as client:
        # Ensure demo mode so the simulate endpoint is reachable.
        config_resp = client.get(f"{BASE_URL}/config")
        assert config_resp.status_code == 200, config_resp.text
        config = config_resp.json()
        if config["integration_mode"] != "demo":
            config["integration_mode"] = "demo"
            put_resp = client.put(f"{BASE_URL}/config", json=config)
            assert put_resp.status_code == 200, put_resp.text

        username = _unique("universe-user")
        payload = {
            "gift_id": "universe",
            "username": username,
            "quantity": 1,
            "benefited_character": "lula",
            "event_id": _unique("universe-event"),
        }
        resp = client.post(f"{BASE_URL}/demo/gift", json=payload)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["gift_id"] == "universe"
        assert body["damage"] == 240, body
        assert body["special_move"] == "ultra_hadouken", body
        assert body["quantity"] == 1

        # A quantity of 2 from the same call keeps the SAME per-unit damage (240); the
        # frontend is responsible for multiplying units, the backend contract never changes.
        payload2 = {
            "gift_id": "universe",
            "username": username,
            "quantity": 2,
            "benefited_character": "lula",
            "event_id": _unique("universe-event-x2"),
        }
        resp2 = client.post(f"{BASE_URL}/demo/gift", json=payload2)
        assert resp2.status_code == 200, resp2.text
        body2 = resp2.json()
        assert body2["damage"] == 240, body2
        assert body2["quantity"] == 2, body2

        # Cross-check: the event appears in the shared event history.
        events_resp = client.get(f"{BASE_URL}/events")
        assert events_resp.status_code == 200
        events = events_resp.json()
        assert any(e["event_id"] == payload2["event_id"] for e in events)
