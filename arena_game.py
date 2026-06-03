import asyncio
import json
import math
import random
import time
import logging
from typing import Dict, Optional

logger = logging.getLogger(__name__)

ARENA_W = 100
ARENA_H = 100
BULLET_SPEED = 35
PLAYER_R = 2
BULLET_R = 0.6
TICK = 0.05
SHOOT_CD = 0.25
MOVE_SPEED = 18
MAX_DURATION = 180
DAMAGE = 20
START_HP = 100


class GameServer:
    def __init__(self):
        self.sessions: Dict[int, "GameSession"] = {}

    def get_or_create(self, arena_id: int) -> "GameSession":
        if arena_id not in self.sessions:
            self.sessions[arena_id] = GameSession(arena_id)
        return self.sessions[arena_id]

    def remove(self, arena_id: int):
        self.sessions.pop(arena_id, None)


game_server = GameServer()


class PlayerState:
    def __init__(self, tg_id: int, username: str, emoji: str, x: float, y: float, db_id: int):
        self.tg_id = tg_id
        self.username = username
        self.emoji = emoji
        self.db_id = db_id
        self.x = x
        self.y = y
        self.hp = START_HP
        self.max_hp = START_HP
        self.alive = True
        self.dx = 0.0
        self.dy = 0.0
        self.last_shot = 0.0
        self.kills = 0


class Bullet:
    def __init__(self, owner_id: int, x: float, y: float, vx: float, vy: float):
        self.owner_id = owner_id
        self.x = x
        self.y = y
        self.vx = vx
        self.vy = vy
        self.alive = True


class GameSession:
    def __init__(self, arena_id: int):
        self.arena_id = arena_id
        self.players: Dict[int, PlayerState] = {}
        self.bullets: list[Bullet] = []
        self.connections: Dict[int, "WebSocket"] = {}
        self.running = False
        self.winner_id: Optional[int] = None
        self.game_over = asyncio.Event()
        self._bids = 0

    def add_player(self, tg_id: int, username: str, emoji: str, db_id: int):
        x = random.uniform(PLAYER_R + 2, ARENA_W - PLAYER_R - 2)
        y = random.uniform(PLAYER_R + 2, ARENA_H - PLAYER_R - 2)
        self.players[tg_id] = PlayerState(tg_id, username, emoji, x, y, db_id)

    def handle_input(self, tg_id: int, data: dict):
        p = self.players.get(tg_id)
        if not p or not p.alive:
            return
        t = data.get("type")
        if t == "move":
            p.dx = max(-1, min(1, data.get("dx", 0)))
            p.dy = max(-1, min(1, data.get("dy", 0)))
        elif t == "shoot":
            now = time.time()
            if now - p.last_shot < SHOOT_CD:
                return
            tx = data.get("target_x", p.x + 1)
            ty = data.get("target_y", p.y)
            dx = tx - p.x
            dy = ty - p.y
            d = math.hypot(dx, dy)
            if d < 0.1:
                return
            vx = dx / d * BULLET_SPEED
            vy = dy / d * BULLET_SPEED
            self.bullets.append(Bullet(p.tg_id, p.x, p.y, vx, vy))
            p.last_shot = now

    def _tick(self):
        for p in self.players.values():
            if not p.alive:
                continue
            speed = MOVE_SPEED * TICK
            p.x += p.dx * speed
            p.y += p.dy * speed
            p.x = max(PLAYER_R, min(ARENA_W - PLAYER_R, p.x))
            p.y = max(PLAYER_R, min(ARENA_H - PLAYER_R, p.y))

        new_bullets = []
        for b in self.bullets:
            if not b.alive:
                continue
            b.x += b.vx * TICK
            b.y += b.vy * TICK
            if b.x < -1 or b.x > ARENA_W + 1 or b.y < -1 or b.y > ARENA_H + 1:
                b.alive = False
                continue
            hit = False
            for p in self.players.values():
                if not p.alive or p.tg_id == b.owner_id:
                    continue
                if math.hypot(b.x - p.x, b.y - p.y) < PLAYER_R + BULLET_R:
                    p.hp -= DAMAGE
                    b.alive = False
                    hit = True
                    if p.hp <= 0:
                        p.alive = False
                        p.hp = 0
                        owner = self.players.get(b.owner_id)
                        if owner:
                            owner.kills += 1
                    break
            if not hit:
                new_bullets.append(b)
        self.bullets = new_bullets

    def _get_state(self):
        return {
            "type": "state",
            "arena_id": self.arena_id,
            "players": [
                {
                    "id": p.tg_id,
                    "username": p.username,
                    "emoji": p.emoji,
                    "x": round(p.x, 1),
                    "y": round(p.y, 1),
                    "hp": p.hp,
                    "max_hp": p.max_hp,
                    "alive": p.alive,
                    "kills": p.kills,
                }
                for p in self.players.values()
            ],
            "bullets": [
                {
                    "id": id(b),
                    "x": round(b.x, 1),
                    "y": round(b.y, 1),
                    "vx": round(b.vx, 1),
                    "vy": round(b.vy, 1),
                }
                for b in self.bullets
            ],
        }

    async def _broadcast(self):
        data = json.dumps(self._get_state())
        dead = []
        for tg_id, ws in self.connections.items():
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(tg_id)
        for tg_id in dead:
            self.connections.pop(tg_id, None)

    async def _broadcast_raw(self, msg: dict):
        data = json.dumps(msg)
        dead = []
        for tg_id, ws in self.connections.items():
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(tg_id)
        for tg_id in dead:
            self.connections.pop(tg_id, None)

    async def _run_loop(self):
        self.running = True
        start = time.time()
        while self.running:
            elapsed = time.time() - start
            if elapsed > MAX_DURATION:
                best = max(self.players.values(), key=lambda p: p.kills) if self.players else None
                if best:
                    self.winner_id = best.tg_id
                self.running = False
                break
            self._tick()
            await self._broadcast()
            alive = [p for p in self.players.values() if p.alive]
            if len(alive) <= 1:
                if alive:
                    self.winner_id = alive[0].tg_id
                self.running = False
                break
            await asyncio.sleep(TICK)

        winner = None
        if self.winner_id and self.winner_id in self.players:
            w = self.players[self.winner_id]
            winner = {"id": w.tg_id, "username": w.username, "emoji": w.emoji, "kills": w.kills}
        await self._broadcast_raw({
            "type": "game_over",
            "winner": winner,
            "players": [
                {
                    "id": p.tg_id,
                    "username": p.username,
                    "alive": p.alive,
                    "kills": p.kills,
                    "hp": p.hp,
                }
                for p in self.players.values()
            ],
        })
        self.game_over.set()
