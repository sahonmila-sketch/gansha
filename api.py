from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional
import uvicorn
from pathlib import Path

from database import Database
from config import API_HOST, API_PORT, WEBAPP_URL, RARITIES, STARS_PACKAGES
from characters import CHARACTERS as ALL_CHARS

app = FastAPI(title="Gacha Battle API")
db = Database()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")


class ReferralRequest(BaseModel):
    telegram_id: int
    code: str


class StarsPurchaseRequest(BaseModel):
    telegram_id: int
    package_index: int


@app.on_event("startup")
async def startup():
    await db.connect()


@app.get("/")
async def root():
    return {
        "status": "ok",
        "webapp_url": WEBAPP_URL,
        "characters_count": len(ALL_CHARS),
    }


@app.get("/profile/{telegram_id}")
async def profile(telegram_id: int, username: Optional[str] = None):
    user = await db.get_or_create_user(telegram_id, username)
    stats = await db.get_profile_stats(telegram_id)
    can_claim, remaining = await db.can_claim_daily(telegram_id)
    lb = await db.get_leaderboard(limit=100)
    rank = next((i + 1 for i, e in enumerate(lb) if e["telegram_id"] == telegram_id), None)
    return {
        **stats,
        "can_claim_daily": can_claim,
        "daily_cooldown": remaining,
        "rank": rank,
        "top_count": len(lb),
    }


@app.post("/open-box/{telegram_id}")
async def open_box(telegram_id: int):
    result, error = await db.open_box(telegram_id)
    if error:
        raise HTTPException(status_code=400, detail=error)
    return result


@app.get("/collection/{telegram_id}")
async def collection(telegram_id: int):
    return await db.get_collection(telegram_id)


@app.get("/leaderboard")
async def leaderboard(limit: int = 20):
    return await db.get_leaderboard(limit)


@app.post("/daily-claim/{telegram_id}")
async def daily_claim(telegram_id: int):
    success, remaining = await db.claim_daily(telegram_id)
    user = await db.get_user(telegram_id)
    return {
        "success": success,
        "message": "Бонус получен!" if success else f"Подождите {remaining // 3600}ч {remaining % 3600 // 60}м",
        "balance_after": user["balance"] if user else 0,
        "next_claim_in": remaining,
    }


@app.post("/referral")
async def referral(req: ReferralRequest):
    success, message = await db.apply_referral(req.telegram_id, req.code)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"success": True, "message": message}


@app.get("/characters")
async def characters():
    return ALL_CHARS


@app.post("/set-main-card/{telegram_id}/{card_id}")
async def set_main_card(telegram_id: int, card_id: int):
    success, message = await db.set_main_card(telegram_id, card_id)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"success": True, "message": message}


@app.get("/main-card/{telegram_id}")
async def get_main_card(telegram_id: int):
    card = await db.get_main_card(telegram_id)
    return card or {}


@app.post("/purchase-stars")
async def purchase_stars(req: StarsPurchaseRequest):
    if req.package_index < 0 or req.package_index >= len(STARS_PACKAGES):
        raise HTTPException(status_code=400, detail="Неверный пакет")
    pkg = STARS_PACKAGES[req.package_index]
    await db.add_coins(req.telegram_id, pkg["coins"], f"Покупка через Stars: пакет {pkg['stars']} Stars")
    user = await db.get_user(req.telegram_id)
    return {
        "success": True,
        "coins_added": pkg["coins"],
        "balance": user["balance"],
    }


@app.get("/rarities")
async def rarities():
    return RARITIES


@app.get("/packages")
async def packages():
    return STARS_PACKAGES


# ── Missions ──

@app.get("/missions/{telegram_id}")
async def get_missions(telegram_id: int):
    return await db.get_missions(telegram_id)


@app.post("/claim-mission/{telegram_id}/{mission_id}")
async def claim_mission(telegram_id: int, mission_id: int):
    success, message = await db.claim_mission(telegram_id, mission_id)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"success": True, "message": message}


# ── Battle ──

@app.get("/battle-status/{telegram_id}")
async def battle_status(telegram_id: int):
    return await db.get_battle_status(telegram_id)


@app.post("/battle/{telegram_id}")
async def do_battle(telegram_id: int):
    result, error = await db.do_battle(telegram_id)
    if error:
        raise HTTPException(status_code=400, detail=error)
    return result


class PvPRequest(BaseModel):
    target_id: int


@app.post("/pvp/{challenger_id}")
async def pvp_battle(challenger_id: int, req: PvPRequest):
    result, error = await db.do_pvp_battle(challenger_id, req.target_id)
    if error:
        raise HTTPException(status_code=400, detail=error)
    return result


@app.post("/pvp/queue/join/{telegram_id}")
async def pvp_queue_join(telegram_id: int):
    result, error = await db.join_pvp_queue(telegram_id)
    if error:
        raise HTTPException(status_code=400, detail=error)
    return result


@app.post("/pvp/queue/leave/{telegram_id}")
async def pvp_queue_leave(telegram_id: int):
    await db.leave_pvp_queue(telegram_id)
    return {"success": True}


@app.get("/pvp/queue/status/{telegram_id}")
async def pvp_queue_status(telegram_id: int):
    return await db.get_pvp_queue_status(telegram_id)


# ── Progress ──

@app.get("/equipped/{telegram_id}")
async def get_equipped(telegram_id: int):
    return await db.get_equipped(telegram_id)


class EquipRequest(BaseModel):
    card_id: int
    slot: str

@app.post("/equip/{telegram_id}")
async def equip_card(telegram_id: int, req: EquipRequest):
    success, message = await db.equip_card(telegram_id, req.card_id, req.slot)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"success": True, "message": message}


@app.post("/unequip/{telegram_id}/{slot}")
async def unequip_card(telegram_id: int, slot: str):
    success, message = await db.unequip_card(telegram_id, slot)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"success": True, "message": message}


@app.get("/rank/{telegram_id}")
async def get_rank(telegram_id: int):
    lb = await db.get_leaderboard(limit=100)
    for i, entry in enumerate(lb):
        if entry["telegram_id"] == telegram_id:
            return {"rank": i + 1, "total": len(lb)}
    return {"rank": None, "total": len(lb)}


@app.get("/progress/{telegram_id}")
async def get_progress(telegram_id: int):
    result = await db.get_progress(telegram_id)
    if not result:
        raise HTTPException(status_code=400, detail="Пользователь не найден")
    return result


def run_api():
    uvicorn.run(app, host=API_HOST, port=API_PORT)


if __name__ == "__main__":
    run_api()
