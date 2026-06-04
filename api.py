from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional
import uvicorn
from pathlib import Path

from database import Database
from config import API_HOST, API_PORT, WEBAPP_URL, RARITIES, STARS_PACKAGES, ADMIN_IDS
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


class BBScoreRequest(BaseModel):
    score: int


@app.on_event("startup")
async def startup():
    await db.connect()


async def _check_banned(telegram_id: int):
    if await db.check_banned(telegram_id):
        raise HTTPException(status_code=403, detail="Вы забанены")


async def _check_admin(telegram_id: int):
    user = await db.get_user(telegram_id)
    if not user or not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Требуются права администратора")


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
    await _check_banned(telegram_id)
    result, error = await db.open_box(telegram_id)
    if error:
        raise HTTPException(status_code=400, detail=error)
    return result


@app.get("/collection/{telegram_id}")
async def collection(telegram_id: int):
    await _check_banned(telegram_id)
    return await db.get_collection(telegram_id)


@app.get("/leaderboard")
async def leaderboard(limit: int = 20):
    return await db.get_leaderboard(limit)


@app.post("/daily-claim/{telegram_id}")
async def daily_claim(telegram_id: int):
    await _check_banned(telegram_id)
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
    await _check_banned(req.telegram_id)
    success, message = await db.apply_referral(req.telegram_id, req.code)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"success": True, "message": message}


@app.get("/characters")
async def characters():
    return ALL_CHARS


@app.post("/set-main-card/{telegram_id}/{card_id}")
async def set_main_card(telegram_id: int, card_id: int):
    await _check_banned(telegram_id)
    success, message = await db.set_main_card(telegram_id, card_id)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"success": True, "message": message}


@app.get("/main-card/{telegram_id}")
async def get_main_card(telegram_id: int):
    await _check_banned(telegram_id)
    card = await db.get_main_card(telegram_id)
    return card or {}


@app.post("/purchase-stars")
async def purchase_stars(req: StarsPurchaseRequest):
    await _check_banned(req.telegram_id)
    if req.package_index < 0 or req.package_index >= len(STARS_PACKAGES):
        raise HTTPException(status_code=400, detail="Неверный пакет")
    pkg = STARS_PACKAGES[req.package_index]
    await db.add_coins(req.telegram_id, pkg["coins"], f"Покупка через Stars: пакет {pkg['stars']} Stars")
    await db.add_free_boxes(req.telegram_id, pkg["boxes"])
    user = await db.get_user(req.telegram_id)
    return {
        "success": True,
        "coins_added": pkg["coins"],
        "boxes_added": pkg["boxes"],
        "balance": user["balance"],
        "free_boxes": user["free_boxes"],
    }


@app.get("/rarities")
async def rarities():
    return RARITIES


@app.get("/packages")
async def packages():
    return STARS_PACKAGES


# ── Block Blast ──

@app.post("/submit-bb-score/{telegram_id}")
async def submit_bb_score(telegram_id: int, req: BBScoreRequest):
    await _check_banned(telegram_id)
    result, error = await db.submit_bb_score(telegram_id, req.score)
    if error:
        raise HTTPException(status_code=400, detail=error)
    return result


@app.get("/bb-data/{telegram_id}")
async def get_bb_data(telegram_id: int):
    await _check_banned(telegram_id)
    result = await db.get_bb_data(telegram_id)
    if not result:
        raise HTTPException(status_code=400, detail="Пользователь не найден")
    return result


@app.post("/claim-bb-milestone/{telegram_id}/{threshold}")
async def claim_bb_milestone(telegram_id: int, threshold: int):
    await _check_banned(telegram_id)
    result, error = await db.claim_bb_milestone(telegram_id, threshold)
    if error:
        raise HTTPException(status_code=400, detail=error)
    return result


# ── Missions ──

@app.get("/missions/{telegram_id}")
async def get_missions(telegram_id: int):
    await _check_banned(telegram_id)
    return await db.get_missions(telegram_id)


@app.post("/claim-mission/{telegram_id}/{mission_id}")
async def claim_mission(telegram_id: int, mission_id: int):
    await _check_banned(telegram_id)
    success, message = await db.claim_mission(telegram_id, mission_id)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"success": True, "message": message}


# ── Battle ──

@app.get("/battle-status/{telegram_id}")
async def battle_status(telegram_id: int):
    await _check_banned(telegram_id)
    return await db.get_battle_status(telegram_id)


@app.post("/battle/{telegram_id}")
async def do_battle(telegram_id: int):
    await _check_banned(telegram_id)
    result, error = await db.do_battle(telegram_id)
    if error:
        raise HTTPException(status_code=400, detail=error)
    return result


class PvPRequest(BaseModel):
    target_id: int


@app.post("/pvp/{challenger_id}")
async def pvp_battle(challenger_id: int, req: PvPRequest):
    await _check_banned(challenger_id)
    result, error = await db.do_pvp_battle(challenger_id, req.target_id)
    if error:
        raise HTTPException(status_code=400, detail=error)
    return result


@app.post("/pvp/queue/join/{telegram_id}")
async def pvp_queue_join(telegram_id: int):
    await _check_banned(telegram_id)
    result, error = await db.join_pvp_queue(telegram_id)
    if error:
        raise HTTPException(status_code=400, detail=error)
    return result


@app.post("/pvp/queue/leave/{telegram_id}")
async def pvp_queue_leave(telegram_id: int):
    await _check_banned(telegram_id)
    await db.leave_pvp_queue(telegram_id)
    return {"success": True}


@app.get("/pvp/queue/status/{telegram_id}")
async def pvp_queue_status(telegram_id: int):
    await _check_banned(telegram_id)
    return await db.get_pvp_queue_status(telegram_id)


# ── Progress ──

@app.get("/equipped/{telegram_id}")
async def get_equipped(telegram_id: int):
    await _check_banned(telegram_id)
    return await db.get_equipped(telegram_id)


class EquipRequest(BaseModel):
    card_id: int
    slot: str

@app.post("/equip/{telegram_id}")
async def equip_card(telegram_id: int, req: EquipRequest):
    await _check_banned(telegram_id)
    success, message = await db.equip_card(telegram_id, req.card_id, req.slot)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"success": True, "message": message}


@app.post("/unequip/{telegram_id}/{slot}")
async def unequip_card(telegram_id: int, slot: str):
    await _check_banned(telegram_id)
    success, message = await db.unequip_card(telegram_id, slot)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"success": True, "message": message}


@app.get("/rank/{telegram_id}")
async def get_rank(telegram_id: int):
    await _check_banned(telegram_id)
    lb = await db.get_leaderboard(limit=100)
    for i, entry in enumerate(lb):
        if entry["telegram_id"] == telegram_id:
            return {"rank": i + 1, "total": len(lb)}
    return {"rank": None, "total": len(lb)}


@app.get("/progress/{telegram_id}")
async def get_progress(telegram_id: int):
    await _check_banned(telegram_id)
    result = await db.get_progress(telegram_id)
    if not result:
        raise HTTPException(status_code=400, detail="Пользователь не найден")
    return result


# ── Admin ──

class AdminBanRequest(BaseModel):
    admin_id: int
    target_id: int

class AdminActionRequest(BaseModel):
    admin_id: int

@app.post("/admin/ban/{target_id}")
async def admin_ban(target_id: int, req: AdminActionRequest):
    await _check_admin(req.admin_id)
    if target_id == req.admin_id:
        raise HTTPException(status_code=400, detail="Нельзя забанить самого себя")
    target = await db.get_user(target_id)
    if not target:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if target.get("is_admin"):
        raise HTTPException(status_code=400, detail="Нельзя забанить администратора")
    await db.ban_user(target_id)
    return {"success": True, "message": f"Пользователь {target_id} забанен"}

@app.post("/admin/unban/{target_id}")
async def admin_unban(target_id: int, req: AdminActionRequest):
    await _check_admin(req.admin_id)
    target = await db.get_user(target_id)
    if not target:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    await db.unban_user(target_id)
    return {"success": True, "message": f"Пользователь {target_id} разбанен"}

@app.get("/admin/check/{telegram_id}")
async def admin_check(telegram_id: int):
    user = await db.get_user(telegram_id)
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return {"is_admin": user.get("is_admin", 0) == 1, "is_banned": user.get("is_banned", 0) == 1}

def run_api():
    uvicorn.run(app, host=API_HOST, port=API_PORT)


if __name__ == "__main__":
    run_api()
