"""Criterion: Toda vitória e derrota de rodada é persistida sem limitar o loop.

POST /api/live/results registers winner/loser/contributors/gifts_count; repeating the
same game_id+session_id+round is idempotent (same row returned, no duplicate created);
GET lists recent results and a different round for the same session is a brand new row,
proving the round loop keeps incrementing without a configured limit.
"""
import uuid

import httpx

BASE_URL = "http://localhost:8001/api/live"


def test_post_round_result_is_idempotent_on_game_session_round():
    session_id = f"tscheck-results-{uuid.uuid4().hex[:8]}"
    payload = {
        "game_id": "main-arena",
        "session_id": session_id,
        "round": 1,
        "winner": "lula",
        "loser": "flavio",
        "contributors": ["tscheck_alice", "tscheck_bob"],
        "gifts_count": 2,
    }
    with httpx.Client(timeout=10) as client:
        first = client.post(f"{BASE_URL}/results", json=payload)
        assert first.status_code == 200, first.text
        first_body = first.json()
        assert first_body["winner"] == "lula", first_body
        assert first_body["loser"] == "flavio", first_body
        assert first_body["gifts_count"] == 2, first_body
        assert first_body["contributors"] == ["tscheck_alice", "tscheck_bob"], first_body

        # Repeat the identical game_id+session_id+round with a different payload body:
        # idempotency key wins, so the originally-stored row comes back unchanged (no 2nd row).
        repeat_payload = dict(payload, winner="flavio", loser="lula", gifts_count=99)
        second = client.post(f"{BASE_URL}/results", json=repeat_payload)
        assert second.status_code == 200, second.text
        second_body = second.json()
        assert second_body["id"] == first_body["id"], second_body
        assert second_body["winner"] == "lula", second_body
        assert second_body["gifts_count"] == 2, second_body

        # GET lists recent results and must contain exactly one row for this id.
        listing = client.get(f"{BASE_URL}/results")
        assert listing.status_code == 200, listing.text
        rows = listing.json()
        matching = [r for r in rows if r["id"] == first_body["id"]]
        assert len(matching) == 1, matching

        # The loop is not limited: round 2 for the same session is a brand new, distinct row.
        round_two_payload = dict(payload, round=2)
        third = client.post(f"{BASE_URL}/results", json=round_two_payload)
        assert third.status_code == 200, third.text
        third_body = third.json()
        assert third_body["id"] != first_body["id"], third_body
        assert third_body["round"] == 2, third_body
