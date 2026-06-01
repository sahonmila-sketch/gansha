from pydantic import BaseModel
from typing import Optional


class UserCreate(BaseModel):
    telegram_id: int
    username: Optional[str] = None


class UserOut(BaseModel):
    telegram_id: int
    username: Optional[str] = None
    balance: int
    boxes_opened: int
    referral_code: str
    referred_by: Optional[int] = None


class CardOut(BaseModel):
    id: int
    name: str
    rarity: str
    emoji: str
    description: str
    count: int = 0
    obtained: bool = False


class OpenBoxResult(BaseModel):
    card: CardOut
    is_new: bool
    balance_after: int


class LeaderboardEntry(BaseModel):
    telegram_id: int
    username: Optional[str] = None
    cards_total: int
    legendaries: int


class DailyClaimResult(BaseModel):
    success: bool
    message: str
    balance_after: int
    next_claim_in: Optional[int] = None
