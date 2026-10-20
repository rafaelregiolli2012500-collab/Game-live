"""Criterion: GET /api/live/config exposes v9 defaults — rules_version 7 and the Universo
gift rule's animation_ms raised to 4800 for its longer four-second cinematic."""
import httpx

BASE_URL = "http://localhost:8001/api/live"


def test_live_config_reports_rules_version_7_and_universe_animation_4800():
    with httpx.Client(timeout=10) as client:
        resp = client.get(f"{BASE_URL}/config")
        assert resp.status_code == 200, resp.text
        config = resp.json()

        assert config["rules_version"] == 7, config

        universe_rule = next((r for r in config["rules"] if r["gift_id"] == "universe"), None)
        assert universe_rule is not None, config["rules"]
        assert universe_rule["animation_ms"] == 4800, universe_rule
        assert universe_rule["damage"] == 240, universe_rule
        assert universe_rule["special_move"] == "ultra_hadouken", universe_rule

        # Cross-check status endpoint stays healthy/demo (no auth required).
        status_resp = client.get(f"{BASE_URL}/status")
        assert status_resp.status_code == 200, status_resp.text
