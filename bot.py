import asyncio
import logging
from datetime import datetime, timedelta, timezone

from aiogram import Bot, Dispatcher, types
from aiogram.filters import Command
from aiogram.types import (
    InlineKeyboardMarkup, InlineKeyboardButton,
    BotCommand, BotCommandScopeDefault, LabeledPrice,
)
from aiogram.enums.parse_mode import ParseMode

from config import BOT_TOKEN, WEBAPP_URL, CURRENCY_NAME, BOX_PRICE, STARS_PACKAGES, RARITIES, ADMIN_IDS
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
        [InlineKeyboardButton(text="⭐ Купить звёзды", callback_data="shop")],
    ])


def rarity_emoji(rarity):
    return {"common": "⬜", "rare": "🟦", "epic": "🟪", "legendary": "🟨"}.get(rarity, "⬜")

async def _check_admin(telegram_id: int) -> bool:
    user = await db.get_user(telegram_id)
    return user is not None and user.get("is_admin", 0) == 1

async def _check_banned(telegram_id: int) -> bool:
    return await db.check_banned(telegram_id)


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
    if await _check_banned(message.from_user.id):
        await message.answer("❌ Вы забанены в боте.")
        return
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
    if await _check_banned(message.from_user.id):
        await message.answer("❌ Вы забанены в боте.")
        return
    await db.get_or_create_user(message.from_user.id, message.from_user.username)
    await _send_profile(message, message.from_user.id)


@dp.message(Command("setmain"))
async def cmd_setmain(message: types.Message):
    if await _check_banned(message.from_user.id):
        await message.answer("❌ Вы забанены в боте.")
        return
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
    if await _check_banned(callback.from_user.id):
        await callback.answer("❌ Вы забанены", show_alert=True)
        return
    card_id = int(callback.data.split("_")[1])
    success, msg = await db.set_main_card(callback.from_user.id, card_id)
    await callback.answer(msg)
    if success:
        await _send_profile(callback.message, callback.from_user.id)


@dp.message(Command("daily"))
async def cmd_daily(message: types.Message):
    if await _check_banned(message.from_user.id):
        await message.answer("❌ Вы забанены в боте.")
        return
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
    if await _check_banned(message.from_user.id):
        await message.answer("❌ Вы забанены в боте.")
        return
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
    if await _check_banned(message.from_user.id):
        await message.answer("❌ Вы забанены в боте.")
        return
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
    if await _check_banned(message.from_user.id):
        await message.answer("❌ Вы забанены в боте.")
        return
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
    if await _check_banned(message.from_user.id):
        await message.answer("❌ Вы забанены в боте.")
        return
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
    if await _check_banned(message.from_user.id):
        await message.answer("❌ Вы забанены в боте.")
        return
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
    if await _check_banned(message.from_user.id):
        await message.answer("❌ Вы забанены в боте.")
        return
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
    if await _check_banned(callback.from_user.id):
        await callback.answer("❌ Вы забанены", show_alert=True)
        return
    await db.get_or_create_user(callback.from_user.id, callback.from_user.username)
    await _send_profile(callback.message, callback.from_user.id)
    await callback.answer()


@dp.callback_query(lambda c: c.data == "top")
async def cb_top(callback: types.CallbackQuery):
    if await _check_banned(callback.from_user.id):
        await callback.answer("❌ Вы забанены", show_alert=True)
        return
    await cmd_top(callback.message)
    await callback.answer()

@dp.callback_query(lambda c: c.data == "collection")
async def cb_collection(callback: types.CallbackQuery):
    if await _check_banned(callback.from_user.id):
        await callback.answer("❌ Вы забанены", show_alert=True)
        return
    await cmd_collection(callback.message)
    await callback.answer()


@dp.callback_query(lambda c: c.data == "shop")
async def cb_shop(callback: types.CallbackQuery):
    if await _check_banned(callback.from_user.id):
        await callback.answer("❌ Вы забанены", show_alert=True)
        return
    user = await db.get_user(callback.from_user.id)
    text = (
        f"⭐ <b>Магазин</b>\n\n"
        f"💰 Баланс: <b>{user['balance']}</b> {CURRENCY_NAME}\n"
        f"🎁 Бесплатных ящиков: <b>{user['free_boxes']}</b>\n\n"
        f"┌ <b>Пакеты Telegram Stars ⭐</b>\n"
    )
    kb = InlineKeyboardMarkup(inline_keyboard=[])
    for i, pkg in enumerate(STARS_PACKAGES):
        text += f"├ {pkg['stars']} ⭐ → 🪙 {pkg['coins']} + 🎁 {pkg['boxes']} ящ.\n"
        kb.inline_keyboard.append([
            InlineKeyboardButton(text=f"💎 {pkg['stars']} ⭐ — Купить", callback_data=f"buystars_{i}")
        ])
    text += "└\n\nНажмите на пакет, чтобы оплатить Telegram Stars:"
    kb.inline_keyboard.append([InlineKeyboardButton(text="🔙 Назад", callback_data="profile")])
    await callback.message.edit_text(text, parse_mode=ParseMode.HTML, reply_markup=kb)
    await callback.answer()

@dp.callback_query(lambda c: c.data and c.data.startswith("buystars_"))
async def cb_buystars(callback: types.CallbackQuery):
    if await _check_banned(callback.from_user.id):
        await callback.answer("❌ Вы забанены", show_alert=True)
        return
    idx = int(callback.data.split("_")[1])
    if idx < 0 or idx >= len(STARS_PACKAGES):
        await callback.answer("Неверный пакет")
        return
    pkg = STARS_PACKAGES[idx]
    prices = [LabeledPrice(label=f"{pkg['stars']} ⭐", amount=pkg['stars'])]
    try:
        link = await bot.create_invoice_link(
            title=f"{pkg['stars']} ⭐ Звёзд",
            description=f"🪙 {pkg['coins']} монет + 🎁 {pkg['boxes']} ящиков",
            payload=f"stars_pkg_{idx}",
            currency="XTR",
            prices=prices,
        )
        await callback.message.answer(
            f"💎 <b>Пакет {pkg['stars']} ⭐</b>\n\n"
            f"🪙 +{pkg['coins']} монет\n"
            f"🎁 +{pkg['boxes']} ящиков\n\n"
            f"Нажмите ниже для оплаты:",
            parse_mode=ParseMode.HTML,
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(text=f"💳 Оплатить {pkg['stars']} ⭐", url=link)],
                [InlineKeyboardButton(text="🔙 В магазин", callback_data="shop")],
            ])
        )
    except Exception as e:
        await callback.message.answer(f"❌ Ошибка создания счёта: {e}")
    await callback.answer()

@dp.pre_checkout_query()
async def pre_checkout_handler(pre_checkout_q: types.PreCheckoutQuery):
    await bot.answer_pre_checkout_query(pre_checkout_q.id, ok=True)

@dp.message(lambda m: m.successful_payment is not None)
async def payment_success(message: types.Message):
    payload = message.successful_payment.invoice_payload
    try:
        idx = int(payload.split("_")[-1])
        pkg = STARS_PACKAGES[idx]
        await db.add_coins(message.from_user.id, pkg["coins"], f"Покупка Stars: пакет {pkg['stars']} ⭐")
        await db.add_free_boxes(message.from_user.id, pkg["boxes"])
        await message.answer(
            f"✅ <b>Оплата прошла успешно!</b>\n\n"
            f"Получено:\n"
            f"├ 🪙 +{pkg['coins']} {CURRENCY_NAME}\n"
            f"└ 🎁 +{pkg['boxes']} ящиков\n\n"
            f"Спасибо за покупку! 🙌",
            parse_mode=ParseMode.HTML,
            reply_markup=main_keyboard()
        )
    except Exception as e:
        await message.answer(f"❌ Ошибка при обработке платежа: {e}", reply_markup=main_keyboard())


@dp.message(Command("admin"))
async def cmd_admin(message: types.Message):
    if not await _check_admin(message.from_user.id):
        await message.answer("❌ У вас нет прав администратора.")
        return
    await message.answer(
        f"🔧 <b>Админ-панель</b>\n\n"
        f"Доступные команды:\n"
        f"├ /ban    id [причина] — забанить\n"
        f"├ /unban  id — разбанить\n"
        f"└ /admin — это меню\n\n"
        f"Также доступно в Mini App (вкладка ⚙️ Админ).",
        parse_mode=ParseMode.HTML,
        reply_markup=main_keyboard()
    )

@dp.message(Command("ban"))
async def cmd_ban(message: types.Message):
    if not await _check_admin(message.from_user.id):
        await message.answer("❌ У вас нет прав администратора.")
        return
    args = message.text.split()
    if len(args) < 2:
        await message.answer("⚠️ Использование: /ban telegram_id [причина]")
        return
    try:
        target_id = int(args[1])
        if target_id == message.from_user.id:
            await message.answer("❌ Нельзя забанить самого себя.")
            return
        target = await db.get_user(target_id)
        if not target:
            await message.answer("❌ Пользователь не найден.")
            return
        if target.get("is_admin"):
            await message.answer("❌ Нельзя забанить администратора.")
            return
        await db.ban_user(target_id)
        reason = " ".join(args[2:]) if len(args) > 2 else "Не указана"
        await message.answer(f"✅ Пользователь <code>{target_id}</code> забанен.\nПричина: {reason}", parse_mode=ParseMode.HTML)
    except ValueError:
        await message.answer("❌ Укажите числовой Telegram ID.")

@dp.message(Command("unban"))
async def cmd_unban(message: types.Message):
    if not await _check_admin(message.from_user.id):
        await message.answer("❌ У вас нет прав администратора.")
        return
    args = message.text.split()
    if len(args) < 2:
        await message.answer("⚠️ Использование: /unban telegram_id")
        return
    try:
        target_id = int(args[1])
        target = await db.get_user(target_id)
        if not target:
            await message.answer("❌ Пользователь не найден.")
            return
        await db.unban_user(target_id)
        await message.answer(f"✅ Пользователь <code>{target_id}</code> разбанен.", parse_mode=ParseMode.HTML)
    except ValueError:
        await message.answer("❌ Укажите числовой Telegram ID.")

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
        BotCommand(command="top", description="🏆 Топ игроков"),
        BotCommand(command="equip", description="⚔️ Экипировать карту"),
        BotCommand(command="unequip", description="🛡️ Снять экипировку"),
        BotCommand(command="kit", description="👀 Моя экипировка"),
        BotCommand(command="setmain", description="⭐ Выбрать главного"),
        BotCommand(command="pvp", description="👤 Битва с игроком"),
        BotCommand(command="admin", description="🔧 Админ-панель"),
        BotCommand(command="ban", description="🔨 Забанить пользователя"),
        BotCommand(command="unban", description="✅ Разбанить пользователя"),

    ], scope=BotCommandScopeDefault())

    asyncio.create_task(daily_notifier())
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
