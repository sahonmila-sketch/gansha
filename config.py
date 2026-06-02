import os
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN", "ВАШ_ТОКЕН_ОТ_BOTFATHER")
API_HOST = os.getenv("API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("PORT") or os.getenv("API_PORT", "8000"))
WEBAPP_URL = os.getenv("WEBAPP_URL", "https://your-domain.com/static/index.html")

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "gacha.db")
DATABASE_URL = os.getenv("DATABASE_URL")

CURRENCY_NAME = "монет"
DAILY_BONUS = 1
BOX_PRICE = 10
INITIAL_BALANCE = 50

RARITIES = {
    "common": {"weight": 70, "color": "#636e72", "label": "Common"},
    "rare": {"weight": 20, "color": "#0984e3", "label": "Rare"},
    "epic": {"weight": 8, "color": "#6c5ce7", "label": "Epic"},
    "legendary": {"weight": 2, "color": "#fdcb6e", "label": "Legendary"},
}

STARS_PACKAGES = [
    {"stars": 100, "coins": 50, "boxes": 5},
    {"stars": 250, "coins": 150, "boxes": 15},
    {"stars": 500, "coins": 400, "boxes": 40},
]

REFERRAL_BONUS = 20

# Battle system
BATTLES_PER_DAY = 5
BATTLE_WIN_BOXES = 1
BATTLE_WIN_TROPHIES = 15
BATTLE_LOSE_COINS = 5
BATTLE_LOSE_TROPHIES = 3
BATTLE_EXTRA_COST = 15
BATTLE_MAX_ROUNDS = 30

# Equipment slots
EQUIP_SLOTS = ["weapon", "armor", "accessory", "mount"]

# Enemy scaling
ENEMY_RARITY_WEIGHTS = [60, 25, 12, 3]  # common, rare, epic, legendary

# Missions
MISSIONS_PER_DAY = 3
MISSION_TYPES = [
    {"type": "OPEN_BOXES", "target": 3, "reward_type": "box", "reward_amount": 2, "desc": "Открой 3 ящика"},
    {"type": "WIN_BATTLES", "target": 2, "reward_type": "box", "reward_amount": 1, "desc": "Выиграй 2 битвы"},
    {"type": "COLLECT_RARE", "target": 2, "reward_type": "coins", "reward_amount": 25, "desc": "Собери 2 редких карты"},
    {"type": "SPEND_COINS", "target": 30, "reward_type": "coins", "reward_amount": 15, "desc": "Потрать 30 монет"},
    {"type": "OPEN_BOXES", "target": 5, "reward_type": "box", "reward_amount": 3, "desc": "Открой 5 ящиков"},
    {"type": "WIN_BATTLES", "target": 3, "reward_type": "coins", "reward_amount": 30, "desc": "Выиграй 3 битвы"},
]

# Level thresholds (cumulative trophies needed)
LEVEL_THRESHOLDS = [0, 30, 70, 130, 210, 320, 460, 630, 840, 1100, 1500]

# Arena (Battle Royale)
ARENA_SIZE = 10
ARENA_CYCLE_MINUTES = 5
ARENA_WIN_TROPHIES = 50
ARENA_WIN_COINS = 100
ARENA_LOSE_COINS = 10
