"""tscheck: slower default combat + CPU frequency config.

Criterion: "A luta padrão está visivelmente mais lenta sem desacelerar especiais" -
backend must report combat.animation_speed 0.85 and combat.auto_attack_frequency 1.12
for the live arena config. The config has since migrated forward to rules_version 7
(v9's Universo cinematic/animation_ms bump) without touching these combat defaults, so
this test now asserts rules_version is at least the v7 baseline rather than pinning the
superseded "6" value from when this check was first written.
"""


def test_live_config_reports_slower_default_combat_values(client):
    resp = client.get("/live/config")
    assert resp.status_code == 200, f"GET /api/live/config -> {resp.status_code} {resp.text[:200]}"
    body = resp.json()

    assert body.get("rules_version", 0) >= 7, f"expected rules_version >= 7, got {body.get('rules_version')}"

    combat = body.get("combat", {})
    assert combat.get("animation_speed") == 0.85, f"expected animation_speed 0.85, got {combat.get('animation_speed')}"
    assert combat.get("auto_attack_frequency") == 1.12, (
        f"expected auto_attack_frequency 1.12, got {combat.get('auto_attack_frequency')}"
    )


def test_live_status_endpoint_is_healthy_alongside_config(client):
    # Sanity cross-check: the status endpoint (used by the HUD) is reachable too,
    # so a slow/err config fetch isn't masking a broader outage.
    resp = client.get("/live/status")
    assert resp.status_code == 200, f"GET /api/live/status -> {resp.status_code} {resp.text[:200]}"
