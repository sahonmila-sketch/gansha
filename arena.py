import asyncio
import random
import logging
import time
from datetime import datetime, timedelta, timezone

from config import ARENA_SIZE, ARENA_CYCLE_MINUTES, ARENA_WIN_TROPHIES, ARENA_WIN_COINS, ARENA_LOSE_COINS

logger = logging.getLogger(__name__)

ARENA_COUNTDOWN = 50


class ArenaManager:
    def __init__(self, db):
        self.db = db
        self._scheduler_task = None
        self._arena_cache = {}
        self._countdowns = {}

    async def start(self):
        self._scheduler_task = asyncio.create_task(self._scheduler_loop())
        await self._create_new_arena()
        logger.info("Arena scheduler started")

    async def stop(self):
        if self._scheduler_task:
            self._scheduler_task.cancel()
            try:
                await self._scheduler_task
            except asyncio.CancelledError:
                pass

    async def _scheduler_loop(self):
        while True:
            await asyncio.sleep(10)
            try:
                now = time.time()
                expired = [aid for aid, deadline in self._countdowns.items() if now >= deadline]
                for aid in expired:
                    del self._countdowns[aid]
                    arena = await self._get_arena(aid)
                    if arena and arena["state"] == "waiting":
                        players = await self._get_arena_players(aid)
                        if len(players) >= 2:
                            logger.info(f"Arena #{aid} countdown expired, starting match")
                            await self._start_match(aid)
                await self._cleanup_finished()
                await self._cleanup_old_cache()
            except Exception as e:
                logger.error(f"Arena tick error: {e}")

    async def _get_arena(self, arena_id: int):
        cursor = await self.db.execute(
            "SELECT * FROM arena_instances WHERE id = ?", (arena_id,)
        )
        row = await cursor.fetchone()
        return dict(row) if row else None

    async def _create_new_arena(self):
        await self.db.execute(
            "INSERT INTO arena_instances (state) VALUES ('waiting')"
        )
        await self.db.commit()
        cursor = await self.db.execute("SELECT MAX(id) as id FROM arena_instances")
        row = await cursor.fetchone()
        arena_id = row["id"] if row else None
        if arena_id:
            logger.info(f"New arena created: #{arena_id}")
        return arena_id

    async def _get_open_arena(self):
        cursor = await self.db.execute(
            "SELECT * FROM arena_instances WHERE state = 'waiting' ORDER BY id ASC LIMIT 1"
        )
        row = await cursor.fetchone()
        return dict(row) if row else None

    async def _get_arena_players(self, arena_id: int):
        cursor = await self.db.execute(
            """SELECT ap.*, u.telegram_id as tg_id, u.username
               FROM arena_players ap
               JOIN users u ON u.id = ap.user_id
               WHERE ap.arena_id = ?
               ORDER BY ap.id""",
            (arena_id,)
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]

    async def join(self, telegram_id: int) -> tuple:
        user = await self.db.get_user(telegram_id)
        if not user:
            return None, "Пользователь не найден"

        cursor = await self.db.execute(
            """SELECT ap.id FROM arena_players ap
               JOIN arena_instances ai ON ai.id = ap.arena_id
               WHERE ap.telegram_id = ? AND ai.state IN ('waiting', 'in_progress')""",
            (telegram_id,)
        )
        existing = await cursor.fetchone()
        if existing:
            return None, "Вы уже в игре!"

        arena = await self._get_open_arena()
        if not arena:
            arena_id = await self._create_new_arena()
        else:
            arena_id = arena["id"]

        mc = await self.db.get_main_card(telegram_id)
        hp = mc.get("hp", 100) if mc else 100

        await self.db.execute(
            "INSERT INTO arena_players (arena_id, user_id, telegram_id, hp, max_hp, pos_x, pos_y) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (arena_id, user["id"], telegram_id, hp, hp, random.randint(5, 95), random.randint(5, 95))
        )
        await self.db.commit()
        logger.info(f"Player {telegram_id} joined arena #{arena_id}")

        players = await self._get_arena_players(arena_id)
        if len(players) >= ARENA_SIZE:
            self._countdowns.pop(arena_id, None)
            await self._start_match(arena_id)
        elif len(players) >= 2 and arena_id not in self._countdowns:
            deadline = time.time() + ARENA_COUNTDOWN
            self._countdowns[arena_id] = deadline
            logger.info(f"Arena #{arena_id} countdown started: {ARENA_COUNTDOWN}s ({len(players)} players)")

        return {"arena_id": arena_id, "players": len(players), "max_players": ARENA_SIZE}, None

    async def _start_match(self, arena_id: int):
        now_str = datetime.now(timezone.utc).isoformat()
        await self.db.execute(
            "UPDATE arena_instances SET state = 'in_progress', started_at = ? WHERE id = ?",
            (now_str, arena_id)
        )
        await self.db.commit()
        logger.info(f"Arena #{arena_id} started!")
        asyncio.create_task(self._run_match(arena_id))

    async def _run_match(self, arena_id: int):
        await asyncio.sleep(2)

        for round_num in range(1, 101):
            players = await self._get_arena_players(arena_id)
            alive = [p for p in players if p["state"] == "alive"]

            if len(alive) <= 1:
                break

            await self.db.execute(
                "UPDATE arena_instances SET round_number = ? WHERE id = ?",
                (round_num, arena_id)
            )

            round_actions = []
            for p in alive:
                targets = [t for t in alive if t["id"] != p["id"]]
                if not targets:
                    continue
                target = random.choice(targets)
                mc = await self.db.get_main_card(p["telegram_id"])
                atk = random.randint(5, max(5, mc.get("atk", 10) // 2)) if mc else random.randint(3, 8)
                new_hp = max(0, target["hp"] - atk)

                round_actions.append({
                    "attacker_tg_id": p["telegram_id"],
                    "attacker_name": p.get("username") or f"ID{p['telegram_id']}",
                    "target_tg_id": target["telegram_id"],
                    "target_name": target.get("username") or f"ID{target['telegram_id']}",
                    "damage": atk,
                    "target_hp_before": target["hp"],
                    "target_hp_after": new_hp,
                })
                target["hp"] = new_hp
                await self.db.execute(
                    "UPDATE arena_players SET hp = ? WHERE id = ?",
                    (new_hp, target["id"])
                )

            await self.db.commit()

            players_after = await self._get_arena_players(arena_id)
            alive_after = [p for p in players_after if p["state"] == "alive"]

            eliminated = []
            for p in alive_after:
                if p["hp"] <= 0:
                    await self.db.execute(
                        "UPDATE arena_players SET state = 'eliminated', elimination_round = ? WHERE id = ?",
                        (round_num, p["id"])
                    )
                    eliminated.append(p)

            await self.db.commit()

            snapshot = {
                "round": round_num,
                "actions": round_actions,
                "alive_count": len(alive_after) - len(eliminated),
                "eliminated": [{
                    "telegram_id": p["telegram_id"],
                    "username": p.get("username") or f"ID{p['telegram_id']}",
                } for p in eliminated],
            }
            self._arena_cache[arena_id] = snapshot

            if len(alive_after) - len(eliminated) <= 1:
                break
            await asyncio.sleep(0.8)

        final_players = await self._get_arena_players(arena_id)
        alive_final = [p for p in final_players if p["state"] == "alive" and p["hp"] > 0]
        winner = alive_final[0] if alive_final else None

        if winner:
            now_str = datetime.now(timezone.utc).isoformat()
            await self.db.execute(
                "UPDATE arena_instances SET state = 'finished', finished_at = ?, winner_id = ? WHERE id = ?",
                (now_str, winner["id"], arena_id)
            )
            await self.db.add_coins(winner["telegram_id"], ARENA_WIN_COINS, f"Победа на арене #{arena_id}")
            await self.db.execute(
                "UPDATE users SET trophies = trophies + ? WHERE telegram_id = ?",
                (ARENA_WIN_TROPHIES, winner["telegram_id"])
            )
            for p in final_players:
                if p["telegram_id"] != winner["telegram_id"]:
                    await self.db.add_coins(p["telegram_id"], ARENA_LOSE_COINS, f"Участие в арене #{arena_id}")
            await self.db.commit()

            self._arena_cache[arena_id] = {
                **self._arena_cache.get(arena_id, {}),
                "winner": {
                    "telegram_id": winner["telegram_id"],
                    "username": winner.get("username") or f"ID{winner['telegram_id']}",
                },
                "finished": True,
            }

        await self._create_new_arena()
        await self._cleanup_old_cache()

    async def get_status(self, telegram_id: int) -> dict:
        cursor = await self.db.execute(
            """SELECT ai.*, ap.state as pstate, ap.hp, ap.max_hp, ap.pos_x, ap.pos_y, ap.elimination_round
               FROM arena_instances ai
               JOIN arena_players ap ON ap.arena_id = ai.id
               WHERE ap.telegram_id = ? AND ai.state IN ('waiting', 'in_progress')
               ORDER BY ai.id DESC LIMIT 1""",
            (telegram_id,)
        )
        row = await cursor.fetchone()
        if not row:
            open_arena = await self._get_open_arena()
            if open_arena:
                cursor2 = await self.db.execute(
                    "SELECT COUNT(*) as cnt FROM arena_players WHERE arena_id = ?",
                    (open_arena["id"],)
                )
                cnt_row = await cursor2.fetchone()
                cnt = cnt_row[0] if hasattr(cnt_row, '__getitem__') else cnt_row["cnt"]
                countdown = self._countdowns.get(open_arena["id"])
                remaining = max(0, int(countdown - time.time())) if countdown else 0
                return {
                    "state": "waiting_join",
                    "arena_id": open_arena["id"],
                    "players": cnt,
                    "max_players": ARENA_SIZE,
                    "countdown": remaining if cnt >= 2 else 0,
                }
            return {"state": "idle"}

        arena = dict(row)
        arena_id = arena["id"]
        all_players = await self._get_arena_players(arena_id)
        alive_count = sum(1 for p in all_players if p["state"] == "alive" and p["hp"] > 0)

        players_info = []
        for p in all_players:
            mc = None
            if p["state"] == "alive" and p["hp"] > 0:
                mc = await self.db.get_main_card(p["telegram_id"])
            players_info.append({
                "telegram_id": p["telegram_id"],
                "username": p.get("username") or f"ID{p['telegram_id']}",
                "hp": p["hp"],
                "max_hp": p["max_hp"],
                "state": p["state"] if p["hp"] > 0 else "eliminated",
                "elimination_round": p.get("elimination_round"),
                "pos_x": p.get("pos_x", 50),
                "pos_y": p.get("pos_y", 50),
                "emoji": mc["emoji"] if mc else "💀",
            })

        countdown = self._countdowns.get(arena_id)
        remaining = max(0, int(countdown - time.time())) if countdown else 0

        return {
            "state": arena["state"],
            "arena_id": arena_id,
            "round": arena.get("round_number", 0),
            "alive_count": alive_count,
            "total": len(all_players),
            "players": players_info,
            "snapshot": self._arena_cache.get(arena_id),
            "countdown": remaining,
        }

    async def get_open_arena_info(self) -> dict:
        arena = await self._get_open_arena()
        if not arena:
            return {"has_open": False, "players": 0, "max_players": ARENA_SIZE}
        cursor = await self.db.execute(
            "SELECT COUNT(*) as cnt FROM arena_players WHERE arena_id = ?",
            (arena["id"],)
        )
        row = await cursor.fetchone()
        cnt = row[0] if hasattr(row, '__getitem__') else row["cnt"]
        countdown = self._countdowns.get(arena["id"])
        remaining = max(0, int(countdown - time.time())) if countdown else 0
        return {
            "has_open": True,
            "arena_id": arena["id"],
            "players": cnt,
            "max_players": ARENA_SIZE,
            "countdown": remaining if cnt >= 2 else 0,
        }

    async def _cleanup_finished(self):
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        cursor = await self.db.execute(
            "SELECT id FROM arena_instances WHERE state = 'finished' AND finished_at < ?",
            (cutoff,)
        )
        rows = await cursor.fetchall()
        for r in rows:
            aid = r[0] if hasattr(r, '__getitem__') else r["id"]
            self._countdowns.pop(aid, None)
            self._arena_cache.pop(aid, None)
            await self.db.execute("DELETE FROM arena_players WHERE arena_id = ?", (aid,))
            await self.db.execute("DELETE FROM arena_instances WHERE id = ?", (aid,))
        if rows:
            await self.db.commit()

    async def _cleanup_old_cache(self):
        if len(self._arena_cache) > 20:
            oldest = sorted(self._arena_cache.keys())[:len(self._arena_cache) - 20]
            for k in oldest:
                self._arena_cache.pop(k, None)
