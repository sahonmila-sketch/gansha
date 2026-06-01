import aiosqlite
import random
import string
from datetime import datetime, timedelta, timezone
from typing import Optional

from config import DB_PATH, RARITIES, DAILY_BONUS, BOX_PRICE, INITIAL_BALANCE, REFERRAL_BONUS
from config import BATTLES_PER_DAY, BATTLE_WIN_BOXES, BATTLE_WIN_TROPHIES, BATTLE_LOSE_COINS, BATTLE_LOSE_TROPHIES, BATTLE_EXTRA_COST, BATTLE_MAX_ROUNDS
from config import EQUIP_SLOTS, ENEMY_RARITY_WEIGHTS, MISSIONS_PER_DAY, MISSION_TYPES, LEVEL_THRESHOLDS
from characters import CHARACTERS, CARD_STATS_BASE, CARD_STATS_PER_LEVEL, RARITY_SPECIALS


def _generate_code(length=8):
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=length))

def _card_power(card: dict, level: int) -> dict:
    base = CARD_STATS_BASE[card["rarity"]]
    pl = CARD_STATS_PER_LEVEL
    hp = base["hp"] + (level - 1) * pl["hp"]
    atk = base["atk"] + (level - 1) * pl["atk"]
    defense = base["def"] + (level - 1) * pl["def"]
    return {"hp": hp, "attack": atk, "defense": defense, "power": atk + defense, "level": level}

def _battle_turn(attacker_card, atk_stat, defender_card, def_stat, defender_hp, attacker_hp=None, crit_chance=0.08):
    crit = random.random() < crit_chance
    damage = max(1, atk_stat - def_stat // 2)
    if crit:
        damage = int(damage * 2)
    defender_hp = max(0, defender_hp - damage)
    return {
        "attacker_name": attacker_card["name"],
        "attacker_emoji": attacker_card["emoji"],
        "attacker_rarity": attacker_card["rarity"],
        "defender_name": defender_card["name"],
        "defender_emoji": defender_card["emoji"],
        "damage": damage,
        "crit": crit,
        "attacker_hp_left": attacker_hp,
        "defender_hp_left": defender_hp,
    }, defender_hp


class Database:
    def __init__(self):
        self.db = None

    async def connect(self):
        self.db = await aiosqlite.connect(DB_PATH)
        self.db.row_factory = aiosqlite.Row
        await self._create_tables()

    async def _create_tables(self):
        await self.db.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                telegram_id INTEGER UNIQUE NOT NULL,
                username TEXT,
                balance INTEGER DEFAULT 50,
                boxes_opened INTEGER DEFAULT 0,
                referral_code TEXT UNIQUE,
                referred_by INTEGER,
                daily_last_claim TEXT,
                free_boxes INTEGER DEFAULT 0,
                trophies INTEGER DEFAULT 0,
                battles_won INTEGER DEFAULT 0,
                battles_total INTEGER DEFAULT 0,
                battles_reset TEXT,
                level INTEGER DEFAULT 1,
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS user_cards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                card_id INTEGER NOT NULL,
                count INTEGER DEFAULT 1,
                obtained_at TEXT DEFAULT (datetime('now')),
                UNIQUE(user_id, card_id),
                FOREIGN KEY(user_id) REFERENCES users(id)
            );
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                type TEXT NOT NULL,
                amount INTEGER NOT NULL,
                description TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY(user_id) REFERENCES users(id)
            );
            CREATE TABLE IF NOT EXISTS missions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                type TEXT NOT NULL,
                target INTEGER DEFAULT 1,
                progress INTEGER DEFAULT 0,
                completed INTEGER DEFAULT 0,
                claimed INTEGER DEFAULT 0,
                reward_type TEXT DEFAULT 'box',
                reward_amount INTEGER DEFAULT 1,
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY(user_id) REFERENCES users(id)
            );
            CREATE TABLE IF NOT EXISTS equipped (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                slot TEXT NOT NULL,
                card_id INTEGER NOT NULL,
                UNIQUE(user_id, slot),
                FOREIGN KEY(user_id) REFERENCES users(id)
            );
            CREATE INDEX IF NOT EXISTS idx_user_cards_user ON user_cards(user_id);
            CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
            CREATE TABLE IF NOT EXISTS user_equipment (
                user_id INTEGER NOT NULL,
                slot TEXT NOT NULL,
                card_id INTEGER NOT NULL,
                equipped_at TEXT DEFAULT (datetime('now')),
                UNIQUE(user_id, slot),
                FOREIGN KEY(user_id) REFERENCES users(id)
            );
            CREATE INDEX IF NOT EXISTS idx_equipment_user ON user_equipment(user_id);
            CREATE INDEX IF NOT EXISTS idx_missions_user ON missions(user_id);
            CREATE TABLE IF NOT EXISTS pvp_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL UNIQUE,
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY(user_id) REFERENCES users(id)
            );
            CREATE TABLE IF NOT EXISTS pvp_battles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                player1_id INTEGER NOT NULL,
                player2_id INTEGER NOT NULL,
                player1_hp INTEGER NOT NULL,
                player2_hp INTEGER NOT NULL,
                player1_max_hp INTEGER NOT NULL,
                player2_max_hp INTEGER NOT NULL,
                current_turn INTEGER DEFAULT 1,
                state TEXT DEFAULT 'active',
                winner_id INTEGER,
                turn_deadline TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                finished_at TEXT,
                FOREIGN KEY(player1_id) REFERENCES users(id),
                FOREIGN KEY(player2_id) REFERENCES users(id)
            );
            CREATE TABLE IF NOT EXISTS pvp_actions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                battle_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                turn_number INTEGER NOT NULL,
                action_type TEXT NOT NULL,
                damage INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY(battle_id) REFERENCES pvp_battles(id)
            );
            CREATE INDEX IF NOT EXISTS idx_pvp_queue_user ON pvp_queue(user_id);
            CREATE INDEX IF NOT EXISTS idx_pvp_battles_user ON pvp_battles(player1_id);
            CREATE INDEX IF NOT EXISTS idx_pvp_battles_user2 ON pvp_battles(player2_id);
            CREATE INDEX IF NOT EXISTS idx_pvp_actions_battle ON pvp_actions(battle_id);
        """)
        await self._migrate()
        await self.db.commit()

    async def _migrate(self):
        cols = [
            ("free_boxes", "INTEGER DEFAULT 0"),
            ("trophies", "INTEGER DEFAULT 0"),
            ("battles_won", "INTEGER DEFAULT 0"),
            ("battles_total", "INTEGER DEFAULT 0"),
            ("battles_reset", "TEXT"),
            ("level", "INTEGER DEFAULT 1"),
            ("main_card_id", "INTEGER"),
        ]
        for name, dtype in cols:
            try:
                await self.db.execute(f"ALTER TABLE users ADD COLUMN {name} {dtype}")
            except aiosqlite.OperationalError:
                pass
        for col in ['balance', 'boxes_opened', 'free_boxes', 'trophies', 'battles_won', 'battles_total', 'level']:
            await self.db.execute(f"UPDATE users SET {col} = CAST(COALESCE(NULLIF({col}, ''), '0') AS INTEGER) WHERE {col} IS NULL OR {col} = '' OR typeof({col}) = 'text'")
        await self.db.execute("UPDATE users SET level = CAST(COALESCE(NULLIF(level, ''), '1') AS INTEGER) WHERE level IS NULL OR level = '' OR typeof(level) = 'text'")
        try:
            await self.db.execute("""CREATE TABLE IF NOT EXISTS equipped (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                slot TEXT NOT NULL,
                card_id INTEGER NOT NULL,
                UNIQUE(user_id, slot),
                FOREIGN KEY(user_id) REFERENCES users(id)
            )""")
        except aiosqlite.OperationalError:
            pass
        await self.db.commit()

    async def get_or_create_user(self, telegram_id: int, username: Optional[str] = None):
        cursor = await self.db.execute("SELECT * FROM users WHERE telegram_id = ?", (telegram_id,))
        user = await cursor.fetchone()
        if user:
            if username and user["username"] != username:
                await self.db.execute("UPDATE users SET username = ? WHERE telegram_id = ?", (username, telegram_id))
                await self.db.commit()
                user = await self.db.execute("SELECT * FROM users WHERE telegram_id = ?", (telegram_id,))
                user = await user.fetchone()
            return self._norm_user(dict(user))

        code = _generate_code()
        while True:
            check = await self.db.execute("SELECT id FROM users WHERE referral_code = ?", (code,))
            if not await check.fetchone():
                break
            code = _generate_code()

        await self.db.execute(
            "INSERT INTO users (telegram_id, username, balance, free_boxes, trophies, referral_code) VALUES (?, ?, ?, 0, 0, ?)",
            (telegram_id, username, INITIAL_BALANCE, code)
        )
        await self.db.commit()
        cursor = await self.db.execute("SELECT * FROM users WHERE telegram_id = ?", (telegram_id,))
        return self._norm_user(dict(await cursor.fetchone()))

    async def set_main_card(self, telegram_id: int, card_id: int):
        user = await self.get_user(telegram_id)
        if not user:
            return False, "Пользователь не найден"
        owned = await self.get_collection(telegram_id)
        if not any(c["id"] == card_id and c["obtained"] for c in owned):
            return False, "У вас нет такой карты!"
        await self.db.execute("UPDATE users SET main_card_id = ? WHERE telegram_id = ?", (card_id, telegram_id))
        await self.db.commit()
        return True, "Главный персонаж выбран!"

    async def get_main_card(self, telegram_id: int):
        user = await self.get_user(telegram_id)
        if not user:
            return None
        equipped = await self.get_equipped(telegram_id)
        weapon = equipped.get("weapon")
        if weapon:
            level = min(weapon.get("count", 1), 10)
            stats = _card_power(weapon, level)
            return {**weapon, "level": level, **stats}
        cursor = await self.db.execute(
            "SELECT card_id, count FROM user_cards WHERE user_id = ? ORDER BY count DESC LIMIT 1",
            (user["id"],)
        )
        row = await cursor.fetchone()
        if not row:
            return None
        card = next((c for c in CHARACTERS if c["id"] == row["card_id"]), None)
        if not card:
            return None
        level = min(row["count"], 10)
        stats = _card_power(card, level)
        return {**card, "level": level, **stats}

    def _norm_user(self, user: dict) -> dict:
        for field in ['balance', 'boxes_opened', 'free_boxes', 'trophies', 'battles_won', 'battles_total', 'level']:
            val = user.get(field)
            user[field] = int(val) if val is not None else 0
        return user

    async def get_user(self, telegram_id: int):
        cursor = await self.db.execute("SELECT * FROM users WHERE telegram_id = ?", (telegram_id,))
        row = await cursor.fetchone()
        return self._norm_user(dict(row)) if row else None

    async def add_coins(self, telegram_id: int, amount: int, description: str = ""):
        await self.db.execute("UPDATE users SET balance = balance + ? WHERE telegram_id = ?", (amount, telegram_id))
        user = await self.get_user(telegram_id)
        await self._add_transaction(user["id"], "earn", amount, description)
        await self.db.commit()

    async def spend_coins(self, telegram_id: int, amount: int, description: str = ""):
        user = await self.get_user(telegram_id)
        if not user or user["balance"] < amount:
            return False
        await self.db.execute("UPDATE users SET balance = balance - ? WHERE telegram_id = ?", (amount, telegram_id))
        await self._add_transaction(user["id"], "spend", -amount, description)
        await self.db.commit()
        return True

    async def _add_transaction(self, user_id: int, ttype: str, amount: int, description: str = ""):
        await self.db.execute(
            "INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)",
            (user_id, ttype, amount, description)
        )
        await self.db.commit()

    async def can_claim_daily(self, telegram_id: int):
        user = await self.get_user(telegram_id)
        if not user or not user["daily_last_claim"]:
            return True, 0
        last = datetime.fromisoformat(user["daily_last_claim"])
        elapsed = datetime.now(timezone.utc) - last
        if elapsed.total_seconds() >= 86400:
            return True, 0
        remaining = int(86400 - elapsed.total_seconds())
        return False, remaining

    async def claim_daily(self, telegram_id: int):
        can, remaining = await self.can_claim_daily(telegram_id)
        if not can:
            return False, remaining
        await self.db.execute(
            "UPDATE users SET balance = balance + ?, daily_last_claim = ? WHERE telegram_id = ?",
            (DAILY_BONUS * 10, datetime.now(timezone.utc).isoformat(), telegram_id)
        )
        user = await self.get_user(telegram_id)
        await self._add_transaction(user["id"], "daily", DAILY_BONUS * 10, "Ежедневный бонус")
        await self.db.commit()
        return True, 0

    async def open_box(self, telegram_id: int):
        user = await self.get_user(telegram_id)
        if not user:
            return None, "Пользователь не найден"

        use_free = False
        if user["free_boxes"] and user["free_boxes"] > 0:
            use_free = True
            await self.db.execute("UPDATE users SET free_boxes = free_boxes - 1 WHERE telegram_id = ?", (telegram_id,))
        elif user["balance"] < BOX_PRICE:
            return None, "Недостаточно монет!"

        if not use_free:
            await self.db.execute("UPDATE users SET balance = balance - ? WHERE telegram_id = ?",
                                  (BOX_PRICE, telegram_id))

        rarities_list = list(RARITIES.keys())
        weights = [RARITIES[r]["weight"] for r in rarities_list]
        chosen_rarity = random.choices(rarities_list, weights=weights, k=1)[0]

        pool = [c for c in CHARACTERS if c["rarity"] == chosen_rarity]
        card = random.choice(pool)

        await self.db.execute("UPDATE users SET boxes_opened = boxes_opened + 1 WHERE telegram_id = ?",
                              (telegram_id,))
        user = await self.get_user(telegram_id)
        desc = f"{'Бесплатный ящик' if use_free else 'Открытие ящика'}: {card['emoji']} {card['name']}"
        if not use_free:
            await self._add_transaction(user["id"], "open_box", -BOX_PRICE, desc)

        cursor = await self.db.execute(
            "SELECT id, count FROM user_cards WHERE user_id = ? AND card_id = ?",
            (user["id"], card["id"])
        )
        existing = await cursor.fetchone()
        is_new = False
        if existing:
            await self.db.execute("UPDATE user_cards SET count = count + 1 WHERE id = ?", (existing["id"],))
        else:
            is_new = True
            await self.db.execute(
                "INSERT INTO user_cards (user_id, card_id) VALUES (?, ?)",
                (user["id"], card["id"])
            )
        await self.db.commit()

        return {
            "card": card,
            "is_new": is_new,
            "balance_after": user["balance"],
            "free_boxes_after": user["free_boxes"],
        }, None

    async def get_collection(self, telegram_id: int):
        user = await self.get_user(telegram_id)
        if not user:
            return []
        cursor = await self.db.execute(
            "SELECT card_id, count FROM user_cards WHERE user_id = ?",
            (user["id"],)
        )
        owned = {row["card_id"]: row["count"] for row in await cursor.fetchall()}
        collection = []
        for c in CHARACTERS:
            collection.append({
                **c,
                "count": owned.get(c["id"], 0),
                "obtained": c["id"] in owned,
            })
        return collection

    async def get_leaderboard(self, limit: int = 20):
        legendary_ids = [c["id"] for c in CHARACTERS if c["rarity"] == "legendary"]
        leg_placeholders = ",".join("?" * len(legendary_ids))
        cursor = await self.db.execute(f"""
            SELECT u.telegram_id, u.username,
                   CAST(COALESCE(COUNT(DISTINCT uc.card_id), 0) AS INTEGER) as unique_cards,
                   CAST(COALESCE(SUM(CASE WHEN uc.card_id IN ({leg_placeholders}) THEN uc.count ELSE 0 END), 0) AS INTEGER) as total_legendaries,
                   COALESCE(u.trophies, 0) as trophies,
                   COALESCE(u.battles_won, 0) as battles_won,
                   u.main_card_id
            FROM users u
            LEFT JOIN user_cards uc ON u.id = uc.user_id
            GROUP BY u.id
            ORDER BY u.trophies DESC, unique_cards DESC
            LIMIT ?
        """, (*legendary_ids, limit))
        rows = await cursor.fetchall()
        result = []
        for r in rows:
            entry = dict(r)
            if entry["main_card_id"]:
                card = next((c for c in CHARACTERS if c["id"] == entry["main_card_id"]), None)
                if card:
                    entry["main_emoji"] = card["emoji"]
                    entry["main_rarity"] = card["rarity"]
                else:
                    entry["main_emoji"] = None
                    entry["main_rarity"] = None
            else:
                entry["main_emoji"] = None
                entry["main_rarity"] = None
            result.append(entry)
        return result

    async def apply_referral(self, telegram_id: int, code: str):
        user = await self.get_user(telegram_id)
        if not user:
            return False, "Пользователь не найден"
        if user["referred_by"]:
            return False, "Вы уже активировали реферальный код!"

        cursor = await self.db.execute("SELECT id, telegram_id FROM users WHERE referral_code = ?", (code,))
        referrer = await cursor.fetchone()
        if not referrer or referrer["telegram_id"] == telegram_id:
            return False, "Неверный реферальный код!"

        await self.db.execute("UPDATE users SET referred_by = ?, balance = balance + ? WHERE telegram_id = ?",
                              (referrer["telegram_id"], REFERRAL_BONUS, telegram_id))
        await self.db.execute("UPDATE users SET balance = balance + ? WHERE telegram_id = ?",
                              (REFERRAL_BONUS, referrer["telegram_id"]))
        await self.db.commit()

        await self._add_transaction(user["id"], "referral", REFERRAL_BONUS, "Реферальный бонус")
        ref_user = await self.get_user(referrer["telegram_id"])
        await self._add_transaction(ref_user["id"], "referral", REFERRAL_BONUS, "Бонус за приглашение")

        return True, f"Вы и ваш друг получили по {REFERRAL_BONUS} монет!"

    async def get_profile_stats(self, telegram_id: int):
        user = await self.get_user(telegram_id)
        if not user:
            return None
        cursor = await self.db.execute(
            "SELECT COUNT(*) as total FROM user_cards WHERE user_id = ?",
            (user["id"],)
        )
        unique_cards = (await cursor.fetchone())[0]
        cursor = await self.db.execute(
            "SELECT COALESCE(SUM(count), 0) as total FROM user_cards WHERE user_id = ?",
            (user["id"],)
        )
        total_cards = (await cursor.fetchone())[0]
        level = self._calc_level(user["trophies"])
        next_trophies = LEVEL_THRESHOLDS[level] if level < len(LEVEL_THRESHOLDS) - 1 else None
        main_card = await self.get_main_card(telegram_id)
        return {
            **user,
            "unique_cards": unique_cards,
            "total_cards": total_cards,
            "level": level,
            "next_level_trophies": next_trophies,
            "main_card": main_card,
        }

    def _calc_level(self, trophies) -> int:
        trophies = int(trophies or 0)
        for i in range(len(LEVEL_THRESHOLDS) - 1, -1, -1):
            if trophies >= LEVEL_THRESHOLDS[i]:
                return i + 1
        return 1

    # ── Missions ──

    async def assign_missions(self, telegram_id: int):
        user = await self.get_user(telegram_id)
        if not user:
            return []
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        cursor = await self.db.execute(
            "SELECT id FROM missions WHERE user_id = ? AND DATE(created_at) = ?",
            (user["id"], today)
        )
        existing = await cursor.fetchall()
        if len(existing) >= MISSIONS_PER_DAY:
            cursor = await self.db.execute(
                "SELECT * FROM missions WHERE user_id = ? AND DATE(created_at) = ?",
                (user["id"], today)
            )
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]

        selected = random.sample(MISSION_TYPES, min(MISSIONS_PER_DAY, len(MISSION_TYPES)))
        for mt in selected:
            await self.db.execute(
                "INSERT INTO missions (user_id, type, target, reward_type, reward_amount) VALUES (?, ?, ?, ?, ?)",
                (user["id"], mt["type"], mt["target"], mt["reward_type"], mt["reward_amount"])
            )
        await self.db.commit()
        cursor = await self.db.execute(
            "SELECT * FROM missions WHERE user_id = ? AND DATE(created_at) = ?",
            (user["id"], today)
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]

    async def get_missions(self, telegram_id: int):
        return await self.assign_missions(telegram_id)

    async def update_mission_progress(self, telegram_id: int, mission_type: str, delta: int = 1):
        user = await self.get_user(telegram_id)
        if not user:
            return
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        await self.db.execute(
            "UPDATE missions SET progress = MIN(progress + ?, target) WHERE user_id = ? AND type = ? AND DATE(created_at) = ? AND completed = 0",
            (delta, user["id"], mission_type, today)
        )
        await self.db.execute(
            "UPDATE missions SET completed = 1 WHERE user_id = ? AND type = ? AND DATE(created_at) = ? AND progress >= target AND completed = 0",
            (user["id"], mission_type, today)
        )
        await self.db.commit()

    async def claim_mission(self, telegram_id: int, mission_id: int):
        user = await self.get_user(telegram_id)
        if not user:
            return False, "Пользователь не найден"
        cursor = await self.db.execute(
            "SELECT * FROM missions WHERE id = ? AND user_id = ? AND claimed = 0 AND completed = 1",
            (mission_id, user["id"])
        )
        mission = await cursor.fetchone()
        if not mission:
            return False, "Задание не выполнено или уже забрано"
        if mission["reward_type"] == "box":
            await self.db.execute("UPDATE users SET free_boxes = free_boxes + ? WHERE telegram_id = ?",
                                  (mission["reward_amount"], telegram_id))
        elif mission["reward_type"] == "coins":
            await self._add_coins_internal(user["id"], mission["reward_amount"], "Награда за задание")
        await self.db.execute("UPDATE missions SET claimed = 1 WHERE id = ?", (mission_id,))
        await self.db.commit()
        return True, "Награда получена!"

    async def _add_coins_internal(self, user_id: int, amount: int, desc: str):
        await self.db.execute("UPDATE users SET balance = balance + ? WHERE id = ?", (amount, user_id))
        await self._add_transaction(user_id, "earn", amount, desc)

    # ── Equip ──

    async def get_equipped(self, telegram_id: int):
        user = await self.get_user(telegram_id)
        if not user:
            return {s: None for s in EQUIP_SLOTS}
        cursor = await self.db.execute(
            "SELECT slot, card_id FROM equipped WHERE user_id = ?", (user["id"],)
        )
        rows = await cursor.fetchall()
        equipped = {s: None for s in EQUIP_SLOTS}
        for row in rows:
            if row["slot"] not in EQUIP_SLOTS:
                continue
            card = next((c for c in CHARACTERS if c["id"] == row["card_id"]), None)
            if card:
                uc = await self.db.execute(
                    "SELECT count FROM user_cards WHERE user_id = ? AND card_id = ?",
                    (user["id"], row["card_id"])
                )
                uc_row = await uc.fetchone()
                ccount = uc_row["count"] if uc_row else 0
                level = min(ccount, 10)
                stats = _card_power(card, level)
                equipped[row["slot"]] = {**card, "count": ccount, "level": level, **stats}
        return equipped

    async def equip_card(self, telegram_id: int, card_id: int, slot: str):
        if slot not in EQUIP_SLOTS:
            return False, "Неверный слот"
        user = await self.get_user(telegram_id)
        if not user:
            return False, "Пользователь не найден"
        uc = await self.db.execute(
            "SELECT id, count FROM user_cards WHERE user_id = ? AND card_id = ?",
            (user["id"], card_id)
        )
        uc_row = await uc.fetchone()
        if not uc_row:
            return False, "Карта не найдена в коллекции"
        card = next((c for c in CHARACTERS if c["id"] == card_id), None)
        if not card:
            return False, "Карта не существует"
        await self.db.execute(
            "INSERT OR REPLACE INTO equipped (user_id, slot, card_id) VALUES (?, ?, ?)",
            (user["id"], slot, card_id)
        )
        await self.db.commit()
        return True, f"{card['emoji']} {card['name']} экипирована в {slot}"

    async def unequip_card(self, telegram_id: int, slot: str):
        if slot not in EQUIP_SLOTS:
            return False, "Неверный слот"
        user = await self.get_user(telegram_id)
        if not user:
            return False, "Пользователь не найден"
        await self.db.execute(
            "DELETE FROM equipped WHERE user_id = ? AND slot = ?",
            (user["id"], slot)
        )
        await self.db.commit()
        return True, f"Слот {slot} очищен"

    # ── Battle ──

    async def get_battle_status(self, telegram_id: int):
        user = await self.get_user(telegram_id)
        if not user:
            return {"battles_left": 0, "can_battle": False, "extra_cost": BATTLE_EXTRA_COST}
        reset = user.get("battles_reset")
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if reset != today:
            await self.db.execute("UPDATE users SET battles_reset = ?, battles_total = 0, battles_won = 0 WHERE telegram_id = ?",
                                  (today, telegram_id))
            await self.db.commit()
            user = await self.get_user(telegram_id)
        battles_done = int(user["battles_total"] or 0)
        battles_left = max(0, BATTLES_PER_DAY - battles_done)
        return {"battles_left": battles_left, "can_battle": battles_left > 0 or user["balance"] >= BATTLE_EXTRA_COST, "extra_cost": BATTLE_EXTRA_COST}

    async def do_battle(self, telegram_id: int):
        user = await self.get_user(telegram_id)
        if not user:
            return None, "Пользователь не найден"

        status = await self.get_battle_status(telegram_id)
        battles_left = status["battles_left"]
        use_extra = False
        if battles_left <= 0:
            if user["balance"] >= BATTLE_EXTRA_COST:
                use_extra = True
                await self.spend_coins(telegram_id, BATTLE_EXTRA_COST, "Дополнительная битва")
            else:
                return None, "Недостаточно монет для битвы!"

        equipped = await self.get_equipped(telegram_id)
        team = [v for v in equipped.values() if v is not None]
        if not team:
            cursor = await self.db.execute(
                "SELECT card_id, count FROM user_cards WHERE user_id = ? ORDER BY count DESC LIMIT 1",
                (user["id"],)
            )
            uc = await cursor.fetchone()
            if not uc:
                return None, "Нет карт для битвы! Открой ящик."
            card = next((c for c in CHARACTERS if c["id"] == uc["card_id"]), None)
            if not card:
                return None, "Ошибка: карта не найдена"
            level = min(uc["count"], 10)
            stats = _card_power(card, level)
            team = [{**card, "level": level, **stats}]

        rarity_list = list(CARD_STATS_BASE.keys())
        enemy_rarity = random.choices(rarity_list, weights=ENEMY_RARITY_WEIGHTS, k=1)[0]
        enemy_pool = [c for c in CHARACTERS if c["rarity"] == enemy_rarity]
        enemy_card = random.choice(enemy_pool)
        enemy_stats = _card_power(enemy_card, 1)
        enemy = {**enemy_card, **enemy_stats}

        p_cur = sum(f["hp"] for f in team)
        e_cur = enemy["hp"]
        p_max_hp = p_cur
        e_max_hp = e_cur
        turns = []
        player_first = random.random() < 0.5

        for turn_num in range(1, BATTLE_MAX_ROUNDS + 1):
            if (turn_num % 2 == 1) == player_first:
                attacker = random.choice(team) if team else None
                if not attacker or p_cur <= 0:
                    break
                result, e_cur = _battle_turn(
                    attacker, attacker["attack"],
                    enemy, enemy["defense"],
                    e_cur, p_cur
                )
                result["turn"] = turn_num
                result["attacker_is_player"] = True
                result["player_hp_pct"] = round(p_cur / p_max_hp * 100)
                result["enemy_hp_pct"] = round(e_cur / e_max_hp * 100)
                turns.append(result)
            else:
                if e_cur <= 0:
                    break
                result, p_cur = _battle_turn(
                    enemy, enemy["attack"],
                    team[0] if team else {"name": "?", "emoji": "❓"},
                    max(f["defense"] for f in team) if team else 0,
                    p_cur, e_cur
                )
                result["turn"] = turn_num
                result["attacker_is_player"] = False
                result["player_hp_pct"] = round(p_cur / p_max_hp * 100)
                result["enemy_hp_pct"] = round(e_cur / e_max_hp * 100)
                turns.append(result)

            if e_cur <= 0 or p_cur <= 0:
                break
        else:
            if p_cur > e_cur:
                e_cur = 0
            else:
                p_cur = 0

        player_won = p_cur > 0 and e_cur <= 0

        await self.db.execute(
            "UPDATE users SET battles_total = battles_total + 1 WHERE telegram_id = ?",
            (telegram_id,)
        )
        if player_won:
            await self.db.execute(
                "UPDATE users SET battles_won = battles_won + 1, free_boxes = free_boxes + ?, trophies = trophies + ? WHERE telegram_id = ?",
                (BATTLE_WIN_BOXES, BATTLE_WIN_TROPHIES, telegram_id)
            )
        else:
            await self.db.execute(
                "UPDATE users SET trophies = trophies + ?, balance = balance + ? WHERE telegram_id = ?",
                (BATTLE_LOSE_TROPHIES, BATTLE_LOSE_COINS, telegram_id)
            )
        await self.db.commit()

        new_level = self._calc_level((await self.get_user(telegram_id))["trophies"])
        first = team[0] if team else {}
        return {
            "player": {
                "team": team,
                "total_hp": p_max_hp,
                "hp_left": p_cur,
                "emoji": first.get("emoji", "❓"),
                "name": first.get("name", "?"),
                "rarity": first.get("rarity", "common"),
                "level": first.get("level", 1),
                "hp": p_max_hp,
                "atk": first.get("attack", 0),
                "def": first.get("defense", 0),
            },
            "enemy": {
                **enemy,
                "hp_left": e_cur,
            },
            "player_won": player_won,
            "turns": turns,
            "rewards": {
                "boxes": BATTLE_WIN_BOXES if player_won else 0,
                "coins": 0 if player_won else BATTLE_LOSE_COINS,
                "trophies": BATTLE_WIN_TROPHIES if player_won else BATTLE_LOSE_TROPHIES,
            },
            "used_extra": use_extra,
            "new_level": new_level,
        }, None

    async def do_pvp_battle(self, challenger_id: int, target_id: int):
        challenger = await self.get_user(challenger_id)
        target = await self.get_user(target_id)
        if not challenger or not target:
            return None, "Один из игроков не найден"
        if challenger_id == target_id:
            return None, "Нельзя сражаться с самим собой!"

        # Get challenger team
        ch_equipped = await self.get_equipped(challenger_id)
        ch_team = [v for v in ch_equipped.values() if v is not None]
        if not ch_team:
            cursor = await self.db.execute(
                "SELECT card_id, count FROM user_cards WHERE user_id = ? ORDER BY count DESC LIMIT 1",
                (challenger["id"],)
            )
            uc = await cursor.fetchone()
            if uc:
                card = next((c for c in CHARACTERS if c["id"] == uc["card_id"]), None)
                if card:
                    level = min(uc["count"], 10)
                    stats = _card_power(card, level)
                    ch_team = [{**card, "level": level, **stats}]

        # Get target team
        tg_equipped = await self.get_equipped(target_id)
        tg_team = [v for v in tg_equipped.values() if v is not None]
        if not tg_team:
            cursor = await self.db.execute(
                "SELECT card_id, count FROM user_cards WHERE user_id = ? ORDER BY count DESC LIMIT 1",
                (target["id"],)
            )
            uc = await cursor.fetchone()
            if uc:
                card = next((c for c in CHARACTERS if c["id"] == uc["card_id"]), None)
                if card:
                    level = min(uc["count"], 10)
                    stats = _card_power(card, level)
                    tg_team = [{**card, "level": level, **stats}]

        if not ch_team:
            return None, "У вас нет карт для битвы!"
        if not tg_team:
            return None, "У противника нет карт для битвы!"

        ch_hp = sum(f["hp"] for f in ch_team)
        tg_hp = sum(f["hp"] for f in tg_team)
        ch_max = ch_hp
        tg_max = tg_hp
        turns = []
        challenger_first = random.random() < 0.5

        for turn_num in range(1, BATTLE_MAX_ROUNDS + 1):
            if (turn_num % 2 == 1) == challenger_first:
                attacker = random.choice(ch_team)
                if not attacker or ch_hp <= 0:
                    break
                result, tg_hp = _battle_turn(
                    attacker, attacker["attack"],
                    tg_team[0], max(f["defense"] for f in tg_team),
                    tg_hp
                )
                result["turn"] = turn_num
                result["attacker_is_challenger"] = True
                result["challenger_hp_pct"] = round(ch_hp / ch_max * 100)
                result["target_hp_pct"] = round(tg_hp / tg_max * 100)
                turns.append(result)
            else:
                if tg_hp <= 0:
                    break
                attacker = random.choice(tg_team)
                result, ch_hp = _battle_turn(
                    attacker, attacker["attack"],
                    ch_team[0], max(f["defense"] for f in ch_team),
                    ch_hp
                )
                result["turn"] = turn_num
                result["attacker_is_challenger"] = False
                result["challenger_hp_pct"] = round(ch_hp / ch_max * 100)
                result["target_hp_pct"] = round(tg_hp / tg_max * 100)
                turns.append(result)

            if tg_hp <= 0 or ch_hp <= 0:
                break
        else:
            if ch_hp > tg_hp:
                tg_hp = 0
            else:
                ch_hp = 0

        challenger_won = ch_hp > 0 and tg_hp <= 0

        # Rewards
        await self.db.execute(
            "UPDATE users SET battles_total = battles_total + 1 WHERE telegram_id IN (?, ?)",
            (challenger_id, target_id)
        )
        if challenger_won:
            await self.db.execute(
                "UPDATE users SET battles_won = battles_won + 1, trophies = trophies + ? WHERE telegram_id = ?",
                (BATTLE_WIN_TROPHIES, challenger_id)
            )
            await self.db.execute(
                "UPDATE users SET balance = balance + ? WHERE telegram_id = ?",
                (BATTLE_LOSE_COINS, target_id)
            )
        else:
            await self.db.execute(
                "UPDATE users SET trophies = trophies + ? WHERE telegram_id = ?",
                (BATTLE_LOSE_TROPHIES, challenger_id)
            )

        # Store in pvp_battles table
        winner_id = challenger["id"] if challenger_won else target["id"]
        await self.db.execute("""
            INSERT INTO pvp_battles (player1_id, player2_id, player1_hp, player2_hp, player1_max_hp, player2_max_hp, current_turn, state, winner_id)
            VALUES (?, ?, ?, ?, ?, ?, 0, 'completed', ?)
        """, (challenger["id"], target["id"], ch_hp, tg_hp, ch_max, tg_max, winner_id))
        await self.db.commit()

        return {
            "challenger": {
                "team": ch_team,
                "total_hp": ch_max,
                "hp_left": ch_hp,
                "username": challenger.get("username") or f"ID{challenger_id}",
            },
            "target": {
                "team": tg_team,
                "total_hp": tg_max,
                "hp_left": tg_hp,
                "username": target.get("username") or f"ID{target_id}",
            },
            "challenger_won": challenger_won,
            "turns": turns,
        }, None

    # ── PvP Queue ──

    async def join_pvp_queue(self, telegram_id: int):
        user = await self.get_user(telegram_id)
        if not user:
            return None, "Пользователь не найден"
        if await self.get_active_pvp(telegram_id):
            return None, "У вас уже есть активный PvP бой!"
        try:
            await self.db.execute(
                "INSERT OR IGNORE INTO pvp_queue (user_id) VALUES (?)",
                (user["id"],)
            )
            await self.db.commit()
        except aiosqlite.IntegrityError:
            pass
        # Try to match
        match = await self._match_players(telegram_id)
        if match:
            return match, None
        return {"status": "queued"}, None

    async def leave_pvp_queue(self, telegram_id: int):
        user = await self.get_user(telegram_id)
        if user:
            await self.db.execute("DELETE FROM pvp_queue WHERE user_id = ?", (user["id"],))
            await self.db.commit()
        return True

    async def get_pvp_queue_status(self, telegram_id: int):
        user = await self.get_user(telegram_id)
        if not user:
            return {"in_queue": False}
        cursor = await self.db.execute("SELECT id FROM pvp_queue WHERE user_id = ?", (user["id"],))
        in_queue = await cursor.fetchone() is not None
        if in_queue:
            # Check if matched
            match = await self._check_just_matched(telegram_id)
            if match:
                return {"in_queue": False, "matched": match}
            cursor2 = await self.db.execute("SELECT COUNT(*) as cnt FROM pvp_queue")
            count = (await cursor2.fetchone())[0]
            return {"in_queue": True, "queue_size": count}
        # Check for active battle
        active = await self.get_active_pvp(telegram_id)
        if active:
            return {"in_queue": False, "in_battle": True, "battle": active}
        return {"in_queue": False}

    async def get_active_pvp_battle(self, telegram_id: int):
        user = await self.get_user(telegram_id)
        if not user:
            return None
        cursor = await self.db.execute("""
            SELECT * FROM pvp_battles
            WHERE (player1_id = ? OR player2_id = ?) AND state = 'active'
            ORDER BY id DESC LIMIT 1
        """, (user["id"], user["id"]))
        row = await cursor.fetchone()
        if not row:
            return None
        return dict(row)

    async def _match_players(self, telegram_id: int):
        user = await self.get_user(telegram_id)
        if not user:
            return None
        cursor = await self.db.execute("""
            SELECT u.telegram_id as tid FROM pvp_queue pq
            JOIN users u ON u.id = pq.user_id
            WHERE pq.user_id != ? AND u.telegram_id != ?
            ORDER BY pq.created_at ASC LIMIT 1
        """, (user["id"], telegram_id))
        match = await cursor.fetchone()
        if not match:
            return None
        target_tid = match["tid"]
        # Remove both from queue
        await self.db.execute("DELETE FROM pvp_queue WHERE user_id IN (?, ?)",
                              (user["id"], (await self.get_user(target_tid))["id"]))
        await self.db.commit()
        # Create battle via do_pvp_battle
        result, error = await self.do_pvp_battle(telegram_id, target_tid)
        if error:
            return None
        return result

    async def _check_just_matched(self, telegram_id: int):
        # Check if there's a just-finished battle for this player
        user = await self.get_user(telegram_id)
        if not user:
            return None
        cursor = await self.db.execute("""
            SELECT * FROM pvp_battles
            WHERE (player1_id = ? OR player2_id = ?) AND state = 'completed'
            ORDER BY id DESC LIMIT 1
        """, (user["id"], user["id"]))
        row = await cursor.fetchone()
        if not row:
            return None
        # Mark as seen
        await self.db.execute("UPDATE pvp_battles SET state = 'archived' WHERE id = ?", (row["id"],))
        await self.db.commit()
        battle = dict(row)
        # Determine who won
        p1_id = battle["player1_id"]
        p2_id = battle["player2_id"]
        # Use the result stored in the battle
        challenger_won = battle["winner_id"] == p1_id
        p1_user = await self.get_user((await (await self.db.execute("SELECT telegram_id FROM users WHERE id = ?", (p1_id,))).fetchone())[0])
        p2_user = await self.get_user((await (await self.db.execute("SELECT telegram_id FROM users WHERE id = ?", (p2_id,))).fetchone())[0])
        return {
            "challenger_won": challenger_won,
            "challenger_username": p1_user.get("username") or f"ID{p1_user['telegram_id']}" if p1_user else "?",
            "target_username": p2_user.get("username") or f"ID{p2_user['telegram_id']}" if p2_user else "?",
        }

    async def get_active_pvp(self, telegram_id: int):
        user = await self.get_user(telegram_id)
        if not user:
            return None
        cursor = await self.db.execute("""
            SELECT b.*, u1.telegram_id as p1_tid, u2.telegram_id as p2_tid
            FROM pvp_battles b
            JOIN users u1 ON u1.id = b.player1_id
            JOIN users u2 ON u2.id = b.player2_id
            WHERE (b.player1_id = ? OR b.player2_id = ?) AND b.state = 'active'
            ORDER BY b.id DESC LIMIT 1
        """, (user["id"], user["id"]))
        row = await cursor.fetchone()
        return dict(row) if row else None

    async def get_progress(self, telegram_id: int):
        user = await self.get_user(telegram_id)
        if not user:
            return None
        trophies = int(user["trophies"] or 0)
        level = self._calc_level(trophies)
        current_threshold = LEVEL_THRESHOLDS[level - 1] if level <= len(LEVEL_THRESHOLDS) else 0
        next_threshold = LEVEL_THRESHOLDS[level] if level < len(LEVEL_THRESHOLDS) else None
        progress = 0
        if next_threshold:
            progress = (trophies - current_threshold) / (next_threshold - current_threshold) * 100
        return {
            "trophies": trophies,
            "level": level,
            "progress_pct": round(progress, 1),
            "next_at": next_threshold,
        }
