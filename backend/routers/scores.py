from fastapi import APIRouter

from lib.db import db
from models.scores import Score, ScoreCreate

router = APIRouter()


@router.get("/leaderboard", response_model=list[Score])
async def get_leaderboard() -> list[Score]:
    rows = await db.scores.find().sort("score", -1).limit(20).to_list(20)
    return [Score(**row) for row in rows]


@router.post("/scores", response_model=Score)
async def create_score(payload: ScoreCreate) -> Score:
    score = Score(**payload.model_dump())
    await db.scores.insert_one(score.model_dump())
    return score