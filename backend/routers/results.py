from fastapi import APIRouter, Query
from pymongo import ReturnDocument

from lib.db import db
from models.results import RoundResult, RoundResultCreate


router = APIRouter()


@router.get("/live/results", response_model=list[RoundResult])
async def read_round_results(limit: int = Query(default=100, ge=1, le=500)) -> list[RoundResult]:
    rows = await db.round_results.find().sort("created_at", -1).limit(limit).to_list(limit)
    return [RoundResult(**row) for row in rows]


@router.post("/live/results", response_model=RoundResult)
async def create_round_result(payload: RoundResultCreate) -> RoundResult:
    result = RoundResult(**payload.model_dump())
    row = await db.round_results.find_one_and_update(
        {"game_id": payload.game_id, "session_id": payload.session_id, "round": payload.round},
        {"$setOnInsert": result.model_dump()},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return RoundResult(**row)