import asyncio
import json
import logging
import random
import string
from typing import Dict, Optional, Tuple

from fastapi import WebSocket

logger = logging.getLogger(__name__)

ROOM_ID_LEN = 6


class LudoRoom:
    def __init__(self, room_id: str):
        self.room_id = room_id
        self.tg_ids: list[int] = []
        self.ws_map: Dict[int, WebSocket] = {}
        self.game_over = False

    def is_full(self) -> bool:
        return len(self.tg_ids) >= 2

    async def send(self, tg_id: int, data: dict):
        ws = self.ws_map.get(tg_id)
        if ws:
            try:
                await ws.send_text(json.dumps(data))
            except Exception:
                pass

    async def broadcast(self, data: dict):
        for tg_id in self.tg_ids:
            await self.send(tg_id, data)

    async def send_opponent(self, tg_id: int, data: dict):
        for pid in self.tg_ids:
            if pid != tg_id:
                await self.send(pid, data)


class LudoGameServer:
    def __init__(self):
        self.rooms: Dict[str, LudoRoom] = {}
        self._tg_to_room: Dict[int, str] = {}

    def _gen_room_id(self) -> str:
        for _ in range(100):
            rid = ''.join(random.choices(string.ascii_uppercase + string.digits, k=ROOM_ID_LEN))
            if rid not in self.rooms:
                return rid
        return str(random.randint(100000, 999999))

    async def create_room(self, host_tg_id: int, ws: WebSocket) -> Tuple[str, LudoRoom]:
        rid = self._gen_room_id()
        room = LudoRoom(rid)
        room.tg_ids.append(host_tg_id)
        room.ws_map[host_tg_id] = ws
        self.rooms[rid] = room
        self._tg_to_room[host_tg_id] = rid
        return rid, room

    async def join_room(self, tg_id: int, room_id: str, ws: WebSocket) -> Tuple[bool, Optional[str]]:
        room = self.rooms.get(room_id)
        if not room:
            return False, "Комната не найдена"

        # Reconnection: player already in room, just update WS
        if tg_id not in room.tg_ids:
            if room.is_full():
                return False, "Комната заполнена"
            room.tg_ids.append(tg_id)

        room.ws_map[tg_id] = ws
        self._tg_to_room[tg_id] = room_id

        # Send player indices to both
        for i, pid in enumerate(room.tg_ids):
            await room.send(pid, {
                "type": "room_ready",
                "index": i,
                "players": room.tg_ids,
            })

        return True, None

    async def handle_message(self, tg_id: int, raw: str):
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            return

        rid = self._tg_to_room.get(tg_id)
        if not rid:
            return
        room = self.rooms.get(rid)
        if not room:
            return

        msg_type = msg.get("type")

        if msg_type == "ping":
            await room.send(tg_id, {"type": "pong"})
            return

        if msg_type in ("roll", "move", "end_turn", "game_over"):
            # Relay to opponent
            await room.send_opponent(tg_id, msg)

            if msg_type == "game_over":
                room.game_over = True
                await asyncio.sleep(2)
                await self._cleanup_room(rid)

        elif msg_type == "leave":
            await room.send_opponent(tg_id, {"type": "opponent_left"})
            await self._cleanup_room(rid)

    async def disconnect(self, tg_id: int):
        rid = self._tg_to_room.get(tg_id)
        if not rid:
            return
        room = self.rooms.get(rid)
        if room and not room.game_over:
            await room.send_opponent(tg_id, {"type": "opponent_disconnected"})
        await self._cleanup_room(rid)

    async def _cleanup_room(self, rid: str):
        room = self.rooms.pop(rid, None)
        if room:
            for pid in room.tg_ids:
                self._tg_to_room.pop(pid, None)


ludo_server = LudoGameServer()
