import asyncio
import logging
from datetime import datetime, timedelta, timezone

from aiogram import Bot, Dispatcher, types
from aiogram.filters import Command
from aiogram.types import (
    InlineKeyboardMarkup, InlineKeyboardButton,
    BotCommand, BotCommandScopeDefault,
)
from aiogram.enums.parse_mode import ParseMode

from config import BOT_TOKEN, WEBAPP_URL, CURRENCY_NAME, BOX_PRICE, STARS_PACKAGES, RARITIES
from database import Database


logging.basicConfig(level=logging.INFO)

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()
db = Database()
def main_keyboard():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🎁 Открыть ящик", web_app=types.WebAppInfo(url=WEBAPP_URL))],
        [InlineKeyboardButton(text="👤 Профиль", callback_data="profile"),
         InlineKeyboardButton(text="🏆 Топ", callback_data="top")],
        [InlineKeyboardButton(text="📦 Коллекция", callback_data="collection"),
         InlineKeyboardButton(text="⭐ Купить звёзды", callback_data="shop")],
    ])


def rarity_emoji(rarity):
    return {"common": "⬜", "rare": "🟦", "epic": "🟪", "legendary": "🟨"}.get(rarity, "⬜")


async def _send_profile(target, telegram_id: int):
    stats = await db.get_profile_stats(telegram_id)
    can_claim, remaining = await db.can_claim_daily(telegram_id)
    daily_text = "✅ Доступен!" if can_claim else f"⏳ {remaining // 3600}ч {remaining % 3600 // 60}м"
    mc = stats.get("main_card")
    mc_line = f"{mc['emoji']} <b>{mc['name']}</b> (lv{mc['level']})" if mc else "❌ Не выбран"
    text = (
        f"🎯 <b>Ваш профиль</b>\n\n"
        f"{mc_line}\n\n"
        f"┌ <b>Статистика</b>\n"
        f"├ 💰 Баланс: <b>{stats['balance']}</b> {CURRENCY_NAME}\n"
        f"├ 🏆 Трофеи: <b>{stats['trophies']}</b>\n"
        f"├ ⭐ Уровень: <b>{stats['level']}</b>\n"
        f"├ 🎁 Ящиков открыто: <b>{stats['boxes_opened']}</b>\n"
        f"├ 🃏 Уникальных карт: <b>{stats['unique_cards']}</b>\n"
        f"├ 📦 Всего карт: <b>{stats['total_cards']}</b>\n"
        f"├ ⚔️ Побед в битвах: <b>{stats['battles_won'] or 0}</b>\n"
        f"└ 🆔 ID: <code>{stats['telegram_id']}</code>\n\n"
        f"🎁 Ежедневный бонус: {daily_text}\n"
        f"🔗 Реферальный код: <code>{stats['referral_code']}</code>"
    )
    if hasattr(target, 'edit_text'):
        await target.edit_text(text, parse_mode=ParseMode.HTML, reply_markup=main_keyboard())
    else:
        await target.answer(text, parse_mode=ParseMode.HTML, reply_markup=main_keyboard())


@dp.message(Command("start"))
async def cmd_start(message: types.Message):
    user = await db.get_or_create_user(message.from_user.id, message.from_user.username)
    args = message.text.split()
    if len(args) > 1:
        await db.apply_referral(message.from_user.id, args[1])

    await message.answer(
        f"🌟 <b>Gacha Battle</b> — собери легендарных героев!\n\n"
        f"⚔️ Открывай ящики, собирай коллекцию уникальных персонажей\n"
        f"🏆 Сражайся на арене и становись лучшим\n"
        f"👥 Приглашай друзей и получай бонусы\n\n"
        f"┌ <b>Твой старт</b>\n"
        f"├ 💰 Баланс: <b>{user['balance']}</b> {CURRENCY_NAME}\n"
        f"├ 🎁 Цена ящика: <b>{BOX_PRICE}</b> {CURRENCY_NAME}\n"
        f"└ 🆔 ID: <code>{message.from_user.id}</code>\n\n"
        f"Нажимай кнопку ниже, чтобы начать приключение! 👇",
        parse_mode=ParseMode.HTML,
        reply_markup=main_keyboard()
    )


@dp.message(Command("profile"))
async def cmd_profile(message: types.Message):
    await db.get_or_create_user(message.from_user.id, message.from_user.username)
    await _send_profile(message, message.from_user.id)


@dp.message(Command("setmain"))
async def cmd_setmain(message: types.Message):
    await db.get_or_create_user(message.from_user.id, message.from_user.username)
    user = await db.get_user(message.from_user.id)
    collection = await db.get_collection(message.from_user.id)
    owned = [c for c in collection if c["obtained"]]
    if not owned:
        await message.answer("❌ У вас нет карт! Откройте ящик через /start", reply_markup=main_keyboard())
        return
    kb = InlineKeyboardMarkup(inline_keyboard=[])
    for c in owned[:20]:
        kb.inline_keyboard.append([InlineKeyboardButton(text=f"{c['emoji']} {c['name']} (x{c['count']})", callback_data=f"setmain_{c['id']}")])
    kb.inline_keyboard.append([InlineKeyboardButton(text="🔙 Назад", callback_data="profile")])
    await message.answer("⭐ Выберите главного персонажа:", reply_markup=kb)


@dp.callback_query(lambda c: c.data and c.data.startswith("setmain_"))
async def cb_setmain(callback: types.CallbackQuery):
    card_id = int(callback.data.split("_")[1])
    success, msg = await db.set_main_card(callback.from_user.id, card_id)
    await callback.answer(msg)
    if success:
        await _send_profile(callback.message, callback.from_user.id)


@dp.message(Command("daily"))
async def cmd_daily(message: types.Message):
    await db.get_or_create_user(message.from_user.id, message.from_user.username)
    success, remaining = await db.claim_daily(message.from_user.id)
    if success:
        await message.answer(
            f"🎉 <b>Ежедневный бонус получен!</b>\n\n"
            f"💰 +10 {CURRENCY_NAME} зачислено на баланс\n"
            f"🕐 Следующий бонус — через 24 часа",
            parse_mode=ParseMode.HTML,
            reply_markup=main_keyboard()
        )
    else:
        hours = remaining // 3600
        minutes = remaining % 3600 // 60
        await message.answer(
            f"⏳ <b>Бонус ещё не доступен</b>\n\n"
            f"Возвращайся через {hours}ч {minutes}м",
            parse_mode=ParseMode.HTML,
            reply_markup=main_keyboard()
        )


@dp.message(Command("collection"))
async def cmd_collection(message: types.Message):
    collection = await db.get_collection(message.from_user.id)
    owned = [c for c in collection if c["obtained"]]
    total = len(collection)
    text = (
        f"📦 <b>Моя коллекция</b>\n\n"
        f"Собрано: <b>{len(owned)}</b> из {total} персонажей\n\n"
    )
    for rarity in ["legendary", "epic", "rare", "common"]:
        chars = [c for c in owned if c["rarity"] == rarity]
        if chars:
            label = {"legendary": "🌟 ЛЕГЕНДАРНЫЕ", "epic": "💜 ЭПИЧЕСКИЕ", "rare": "🔵 РЕДКИЕ", "common": "⚪ ОБЫЧНЫЕ"}
            text += f"<b>{label[rarity]}</b>\n"
            for c in chars:
                text += f"  {c['emoji']} {c['name']} — x{c['count']}\n"
    if not owned:
        text += "Пока нет карт. Открой ящик! 🎁"
    await message.answer(text, parse_mode=ParseMode.HTML, reply_markup=main_keyboard())


@dp.message(Command("top"))
async def cmd_top(message: types.Message):
    lb = await db.get_leaderboard()
    text = "🏆 <b>Топ игроков</b>\n\n"
    for i, entry in enumerate(lb, 1):
        name = entry["username"] or f"ID {entry['telegram_id']}"
        medal = {1: "🥇", 2: "🥈", 3: "🥉"}.get(i, f"  {i}.")
        crown = " 👑" if i == 1 else ""
        text += f"{medal} <b>{name}</b>{crown}\n"
        text += f"      🃏 {entry['unique_cards']} карт | 🏆 {entry['trophies']} троф.\n"
    await message.answer(text, parse_mode=ParseMode.HTML, reply_markup=main_keyboard())


@dp.message(Command("equip"))
async def cmd_equip(message: types.Message):
    args = message.text.split()
    if len(args) < 3:
        await message.answer(
            f"⚔️ <b>Экипировка карты</b>\n\n"
            f"Использование: <code>/equip id_карты слот</code>\n\n"
            f"Доступные слоты:\n"
            f"├ 🗡️ <code>weapon</code> — оружие\n"
            f"├ 🛡️ <code>armor</code> — броня\n"
            f"├ 💍 <code>accessory</code> — аксессуар\n"
            f"└ 🐉 <code>mount</code> — ездовое\n\n"
            f"Пример: <code>/equip 5 weapon</code>",
            parse_mode=ParseMode.HTML,
            reply_markup=main_keyboard()
        )
        return
    try:
        card_id = int(args[1])
        slot = args[2].lower()
        success, msg = await db.equip_card(message.from_user.id, card_id, slot)
        if success:
            await message.answer(f"✅ {msg}", parse_mode=ParseMode.HTML, reply_markup=main_keyboard())
        else:
            await message.answer(f"❌ {msg}", reply_markup=main_keyboard())
    except ValueError:
        await message.answer("❌ Неверный ID карты", reply_markup=main_keyboard())


@dp.message(Command("unequip"))
async def cmd_unequip(message: types.Message):
    args = message.text.split()
    if len(args) < 2:
        await message.answer(
            f"🛡️ <b>Снятие экипировки</b>\n\n"
            f"Использование: <code>/unequip слот</code>\n\n"
            f"Слоты: <code>weapon</code>, <code>armor</code>, <code>accessory</code>, <code>mount</code>\n\n"
            f"Пример: <code>/unequip weapon</code>",
            parse_mode=ParseMode.HTML,
            reply_markup=main_keyboard()
        )
        return
    slot = args[1].lower()
    success, msg = await db.unequip_card(message.from_user.id, slot)
    if success:
        await message.answer(f"✅ {msg}", parse_mode=ParseMode.HTML, reply_markup=main_keyboard())
    else:
        await message.answer(f"❌ {msg}", reply_markup=main_keyboard())


@dp.message(Command("kit"))
async def cmd_kit(message: types.Message):
    equipped = await db.get_equipped(message.from_user.id)
    text = "⚔️ <b>Моя экипировка</b>\n\n"
    has_any = False
    for slot, card in equipped.items():
        label = {"weapon": "🗡️ Оружие", "armor": "🛡️ Броня", "accessory": "💍 Аксессуар", "mount": "🐉 Ездовое"}
        if card:
            has_any = True
            text += f"{label[slot]}: {card['emoji']} <b>{card['name']}</b>\n"
            text += f"     ❤️{card['hp']} | ⚔️{card['attack']} | 🛡️{card['defense']} | ⭐lv{card['level']}\n"
        else:
            text += f"{label[slot]}: ❌ пусто\n"
    if not has_any:
        text += "Ничего не экипировано. Используй /equip чтобы надеть карту!"
    text += f"\n💡 Всего {sum(1 for v in equipped.values() if v)}/{len(equipped)} слотов занято"
    await message.answer(text, parse_mode=ParseMode.HTML, reply_markup=main_keyboard())


@dp.message(Command("pvp"))
async def cmd_pvp(message: types.Message):
    args = message.text.split()
    if len(args) < 2:
        await message.answer(
            f"⚔️ <b>PvP битва</b>\n\n"
            f"Сразитесь с другим игроком!\n\n"
            f"Использование: <code>/pvp telegram_id</code>\n"
            f"Пример: <code>/pvp 123456789</code>",
            parse_mode=ParseMode.HTML,
            reply_markup=main_keyboard()
        )
        return
    try:
        target_id = int(args[1])
        if target_id == message.from_user.id:
            await message.answer("❌ Нельзя сражаться с самим собой!", reply_markup=main_keyboard())
            return
        result, error = await db.do_pvp_battle(message.from_user.id, target_id)
        if error:
            await message.answer(f"❌ {error}", reply_markup=main_keyboard())
            return
        c = result["challenger"]
        t = result["target"]
        won = result["challenger_won"]
        text = (
            f"{'🎉 <b>ПОБЕДА!</b>' if won else '💀 <b>ПОРАЖЕНИЕ</b>'}\n\n"
            f"┌ <b>Результат боя</b>\n"
            f"├ 👤 Вы: {c['team'][0]['emoji']} {c['team'][0]['name']}\n"
            f"├    ❤️ {c['hp_left']}/{c['total_hp']}\n"
            f"├ 👤 {t['username']}: {t['team'][0]['emoji']} {t['team'][0]['name']}\n"
            f"├    ❤️ {t['hp_left']}/{t['total_hp']}\n"
            f"└ 📊 Ходов: {len(result['turns'])}"
        )
        await message.answer(text, parse_mode=ParseMode.HTML, reply_markup=main_keyboard())
    except ValueError:
        await message.answer("❌ Неверный ID. Укажите числовой Telegram ID", reply_markup=main_keyboard())


@dp.callback_query(lambda c: c.data == "profile")
async def cb_profile(callback: types.CallbackQuery):
    await db.get_or_create_user(callback.from_user.id, callback.from_user.username)
    await _send_profile(callback.message, callback.from_user.id)
    await callback.answer()


@dp.callback_query(lambda c: c.data == "top")
async def cb_top(callback: types.CallbackQuery):
    await cmd_top(callback.message)
    await callback.answer()


@dp.callback_query(lambda c: c.data == "collection")
async def cb_collection(callback: types.CallbackQuery):
    await cmd_collection(callback.message)
    await callback.answer()


@dp.callback_query(lambda c: c.data == "shop")
async def cb_shop(callback: types.CallbackQuery):
    user = await db.get_user(callback.from_user.id)
    text = (
        f"⭐ <b>Магазин</b>\n\n"
        f"💰 Баланс: <b>{user['balance']}</b> {CURRENCY_NAME}\n\n"
        f"┌ <b>Доступные пакеты</b>\n"
    )
    for i, pkg in enumerate(STARS_PACKAGES):
        text += f"├ {i+1}. {pkg['stars']} ⭐ → 🪙 {pkg['coins']} + 🎁 {pkg['boxes']} ящ.\n"
    text += (
        f"└\n\n"
        f"ℹ️ Покупки через Telegram Stars\n"
        f"Скоро будет доступно!"
    )
    await callback.message.answer(text, parse_mode=ParseMode.HTML)
    await callback.answer()


async def daily_notifier():
    while True:
        now = datetime.now(timezone.utc)
        next_run = (now + timedelta(hours=24)).replace(minute=0, second=0, microsecond=0)
        delay = (next_run - now).total_seconds()
        await asyncio.sleep(delay)

        cursor = await db.db.execute("SELECT telegram_id FROM users")
        users = await cursor.fetchall()
        for user in users:
            try:
                await bot.send_message(
                    user["telegram_id"],
                    f"🎁 <b>Ежедневный бонус готов!</b>\n\n"
                    f"Забери свои +10 {CURRENCY_NAME}\n"
                    f"Напиши /daily или открой Mini App! 👇",
                    parse_mode=ParseMode.HTML,
                    reply_markup=main_keyboard()
                )
            except Exception:
                pass


async def main():
    await db.connect()
    await bot.set_my_commands([
        BotCommand(command="start", description="🏠 Главное меню"),
        BotCommand(command="profile", description="👤 Мой профиль"),
        BotCommand(command="daily", description="🎁 Ежедневный бонус"),
        BotCommand(command="collection", description="📦 Моя коллекция"),
        BotCommand(command="top", description="🏆 Топ игроков"),
        BotCommand(command="equip", description="⚔️ Экипировать карту"),
        BotCommand(command="unequip", description="🛡️ Снять экипировку"),
        BotCommand(command="kit", description="👀 Моя экипировка"),
        BotCommand(command="setmain", description="⭐ Выбрать главного"),
        BotCommand(command="pvp", description="👤 Битва с игроком"),

    ], scope=BotCommandScopeDefault())

    asyncio.create_task(daily_notifier())
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
