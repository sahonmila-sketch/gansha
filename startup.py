import asyncio
import logging
import os

logging.basicConfig(level=logging.INFO)

async def main():
    from database import Database
    db = Database()
    await db.connect()

    import api
    api.db = db

    import bot
    bot.db = db

    from bot import dp, bot as tg_bot
    api.bot = tg_bot
    polling_task = asyncio.create_task(dp.start_polling(tg_bot))

    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    config = uvicorn.Config(api.app, host="0.0.0.0", port=port, log_level="info")
    server = uvicorn.Server(config)

    try:
        await server.serve()
    finally:
        polling_task.cancel()
        try:
            await polling_task
        except asyncio.CancelledError:
            pass

if __name__ == "__main__":
    asyncio.run(main())
