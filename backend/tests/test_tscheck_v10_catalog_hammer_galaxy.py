"""Criterion: O catálogo v10 registra os dois novos presentes configuráveis.

GET /api/live/config returns rules_version 8 with hammer/Martelo (invocadores, 150
damage, 3800ms) and galaxy/Galáxia (genkidama, 300 damage, 5200ms). The demo gift
endpoint mirrors those fields for a mocked gift event, and an unknown gift id fails
(404) without creating an event (DEMO/MOCKED gift pipeline — no real TikTok connector).
"""
import uuid

import httpx

BASE_URL = "http://localhost:8001/api/live"


def test_config_exposes_hammer_and_galaxy_rules_v8():
    with httpx.Client(timeout=10) as client:
        resp = client.get(f"{BASE_URL}/config")
        assert resp.status_code == 200, resp.text
        config = resp.json()

        assert config["rules_version"] == 9, config

        hammer = next((r for r in config["rules"] if r["gift_id"] == "hammer"), None)
        assert hammer is not None, config["rules"]
        assert hammer["damage"] == 150, hammer
        assert hammer["animation_ms"] == 3800, hammer
        assert hammer["special_move"] == "invocadores", hammer

        galaxy = next((r for r in config["rules"] if r["gift_id"] == "galaxy"), None)
        assert galaxy is not None, config["rules"]
        assert galaxy["damage"] == 300, galaxy
        assert galaxy["animation_ms"] == 5200, galaxy
        assert galaxy["special_move"] == "genkidama", galaxy


def test_demo_gift_hammer_mirrors_catalog_fields():
    with httpx.Client(timeout=10) as client:
        event_id = f"tscheck-hammer-{uuid.uuid4().hex[:8]}"
        resp = client.post(
            f"{BASE_URL}/demo/gift",
            json={
                "event_id": event_id,
                "gift_id": "hammer",
                "username": "tscheck_user",
                "quantity": 1,
                "benefited_character": "flavio",
            },
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["gift_id"] == "hammer", body
        assert body["damage"] == 150, body
        assert body["special_move"] == "invocadores", body
        assert body["event_id"] == event_id, body


def test_demo_gift_galaxy_mirrors_catalog_fields():
    with httpx.Client(timeout=10) as client:
        event_id = f"tscheck-galaxy-{uuid.uuid4().hex[:8]}"
        resp = client.post(
            f"{BASE_URL}/demo/gift",
            json={
                "event_id": event_id,
                "gift_id": "galaxy",
                "username": "tscheck_user",
                "quantity": 1,
                "benefited_character": "lula",
            },
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["gift_id"] == "galaxy", body
        assert body["damage"] == 300, body
        assert body["special_move"] == "genkidama", body
        assert body["event_id"] == event_id, body


def test_unknown_gift_id_fails_without_creating_event():
    with httpx.Client(timeout=10) as client:
        event_id = f"tscheck-unknown-{uuid.uuid4().hex[:8]}"
        resp = client.post(
            f"{BASE_URL}/demo/gift",
            json={
                "event_id": event_id,
                "gift_id": "nonexistent-gift-xyz",
                "username": "tscheck_user",
                "quantity": 1,
                "benefited_character": "flavio",
            },
        )
        assert resp.status_code == 404, resp.text

        events_resp = client.get(f"{BASE_URL}/events", params={"game_id": "main-arena"})
        assert events_resp.status_code == 200, events_resp.text
        events = events_resp.json()
        matching = [e for e in events if e.get("event_id") == event_id]
        assert matching == [], matching
