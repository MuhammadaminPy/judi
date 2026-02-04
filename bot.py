import os
import json
import time
import asyncio
import random
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from dataclasses import dataclass, asdict

from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
from aiohttp import web
import aiohttp_cors

BOT_TOKEN = "8225194538:AAG5ve1a9mmZOqT1m8ZflA20BOjD7F_FK2o"
ADMIN_IDS = [1027715401]
WEBAPP_URL = os.getenv("WEBAPP_URL", "https://yourusername.github.io/casino-bot")

DATA_DIR = "data"
USERS_FILE = f"{DATA_DIR}/users.json"
TRANSACTIONS_FILE = f"{DATA_DIR}/transactions.json"
GAME_BETS_FILE = f"{DATA_DIR}/game_bets.json"
WITHDRAWALS_FILE = f"{DATA_DIR}/withdrawals.json"
PROMOCODES_FILE = f"{DATA_DIR}/promocodes.json"
PROMO_USES_FILE = f"{DATA_DIR}/promo_uses.json"
SETTINGS_FILE = f"{DATA_DIR}/settings.json"

os.makedirs(DATA_DIR, exist_ok=True)

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()

@dataclass
class User:
    user_id: int
    username: str
    first_name: str
    photo_url: str
    balance: float
    total_deposited: float
    total_withdrawn: float
    total_risk: float
    referrer_id: Optional[int]
    referrals: List[int]
    referral_earnings: float
    joined_at: str
    language: str
    theme: str

@dataclass
class Settings:
    min_deposit_ton: float
    min_deposit_stars: float
    min_withdrawal: float
    stars_to_ton_rate: float
    referral_percent: float
    custom_referral_rates: Dict[str, float]
    leaderboard_mode: str
    leaderboard_period: str

game_state = {
    'current_round': None,
    'countdown': 0,
    'history': [],
    'participants': {'blue': [], 'red': [], 'green': []},
    'active_connections': set()
}

def load_json(filename, default=None):
    if os.path.exists(filename):
        with open(filename, 'r', encoding='utf-8') as f:
            return json.load(f)
    return default if default is not None else []

def save_json(filename, data):
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def load_settings():
    settings_data = load_json(SETTINGS_FILE, {
        'min_deposit_ton': 1.0,
        'min_deposit_stars': 120,
        'min_withdrawal': 5.0,
        'stars_to_ton_rate': 0.01009,
        'referral_percent': 10.0,
        'custom_referral_rates': {},
        'leaderboard_mode': 'activity',
        'leaderboard_period': '24h'
    })
    return Settings(**settings_data)

def save_settings(settings):
    save_json(SETTINGS_FILE, asdict(settings))

settings = load_settings()

def get_user(user_id):
    users = load_json(USERS_FILE, [])
    for user in users:
        if user['user_id'] == user_id:
            return User(**user)
    return None

def create_user(user_id, username, first_name, photo_url, referrer_id=None):
    users = load_json(USERS_FILE, [])
    
    user = User(
        user_id=user_id,
        username=username,
        first_name=first_name,
        photo_url=photo_url,
        balance=0.0,
        total_deposited=0.0,
        total_withdrawn=0.0,
        total_risk=0.0,
        referrer_id=referrer_id,
        referrals=[],
        referral_earnings=0.0,
        joined_at=datetime.now().isoformat(),
        language='ru',
        theme='dark'
    )
    
    users.append(asdict(user))
    save_json(USERS_FILE, users)
    return user

def update_user(user):
    users = load_json(USERS_FILE, [])
    for i, u in enumerate(users):
        if u['user_id'] == user.user_id:
            users[i] = asdict(user)
            break
    save_json(USERS_FILE, users)

async def process_deposit(user_id, amount, method):
    user = get_user(user_id)
    if not user:
        return False
    
    user.balance += amount
    user.total_deposited += amount
    update_user(user)
    
    transactions = load_json(TRANSACTIONS_FILE, [])
    transactions.append({
        'user_id': user_id,
        'type': 'deposit',
        'amount': amount,
        'method': method,
        'timestamp': datetime.now().isoformat()
    })
    save_json(TRANSACTIONS_FILE, transactions)
    
    if user.referrer_id:
        referrer = get_user(user.referrer_id)
        if referrer:
            ref_rate = settings.custom_referral_rates.get(str(user.referrer_id), settings.referral_percent)
            bonus = amount * (ref_rate / 100)
            referrer.balance += bonus
            referrer.referral_earnings += bonus
            update_user(referrer)
    
    return True

async def process_withdrawal(user_id, amount, address):
    user = get_user(user_id)
    if not user or user.balance < amount or amount < settings.min_withdrawal:
        return False
    
    user.balance -= amount
    update_user(user)
    
    withdrawals = load_json(WITHDRAWALS_FILE, [])
    withdrawal = {
        'id': str(len(withdrawals) + 1),
        'user_id': user_id,
        'amount': amount,
        'address': address,
        'status': 'pending',
        'created_at': datetime.now().isoformat()
    }
    withdrawals.append(withdrawal)
    save_json(WITHDRAWALS_FILE, withdrawals)
    
    for admin_id in ADMIN_IDS:
        try:
            await bot.send_message(
                admin_id,
                f"🔔 Новая заявка на вывод\n\n"
                f"👤 User: {user.first_name} (@{user.username})\n"
                f"💰 Сумма: {amount} TON\n"
                f"📍 Адрес: {address}\n"
                f"🆔 ID: {user_id}"
            )
        except:
            pass
    
    return True

async def create_promo_code(code, amount, max_uses, conditions):
    promocodes = load_json(PROMOCODES_FILE, [])
    promo = {
        'code': code,
        'amount': amount,
        'max_uses': max_uses,
        'used_count': 0,
        'conditions': conditions,
        'created_at': datetime.now().isoformat()
    }
    promocodes.append(promo)
    save_json(PROMOCODES_FILE, promocodes)
    return True

async def use_promo_code(user_id, code):
    promocodes = load_json(PROMOCODES_FILE, [])
    promo_uses = load_json(PROMO_USES_FILE, [])
    
    promo = None
    promo_idx = None
    for idx, p in enumerate(promocodes):
        if p['code'] == code:
            promo = p
            promo_idx = idx
            break
    
    if not promo or promo['used_count'] >= promo['max_uses']:
        return False, "Промокод недействителен или исчерпан"
    
    for use in promo_uses:
        if use['user_id'] == user_id and use['code'] == code:
            return False, "Вы уже использовали этот промокод"
    
    user = get_user(user_id)
    conditions = promo['conditions']
    
    if 'min_deposit' in conditions and user.total_deposited < conditions['min_deposit']:
        return False, f"Нужно пополнить минимум {conditions['min_deposit']} TON"
    
    if 'min_deposit_24h' in conditions:
        transactions = load_json(TRANSACTIONS_FILE, [])
        start_time = (datetime.now() - timedelta(hours=24)).isoformat()
        total = sum(t['amount'] for t in transactions 
                   if t['user_id'] == user_id and t['type'] == 'deposit' 
                   and t['timestamp'] >= start_time)
        if total < conditions['min_deposit_24h']:
            return False, "Недостаточно пополнений за последние 24 часа"
    
    if 'min_referrals' in conditions and len(user.referrals) < conditions['min_referrals']:
        return False, f"Нужно пригласить минимум {conditions['min_referrals']} рефералов"
    
    user.balance += promo['amount']
    update_user(user)
    
    promocodes[promo_idx]['used_count'] += 1
    save_json(PROMOCODES_FILE, promocodes)
    
    promo_uses.append({
        'user_id': user_id,
        'code': code,
        'timestamp': datetime.now().isoformat()
    })
    save_json(PROMO_USES_FILE, promo_uses)
    
    return True, f"Промокод активирован! +{promo['amount']} TON"

def get_leaderboard(period, mode, limit=100):
    users = load_json(USERS_FILE, [])
    transactions = load_json(TRANSACTIONS_FILE, [])
    game_bets = load_json(GAME_BETS_FILE, [])
    
    now = datetime.now()
    if period == '24h':
        start_time = (now - timedelta(hours=24)).isoformat()
    elif period == 'week':
        start_time = (now - timedelta(days=7)).isoformat()
    elif period == 'month':
        start_time = (now - timedelta(days=30)).isoformat()
    else:
        start_time = datetime(1970, 1, 1).isoformat()
    
    results = []
    
    if mode == 'activity':
        user_totals = {}
        for t in transactions:
            if t['timestamp'] >= start_time:
                user_totals[t['user_id']] = user_totals.get(t['user_id'], 0) + t['amount']
        results = [{'user_id': uid, 'total': total} for uid, total in user_totals.items()]
        
    elif mode == 'referrals':
        results = [{'user_id': u['user_id'], 'total': len(u['referrals'])} for u in users]
        
    elif mode == 'deposits':
        user_totals = {}
        for t in transactions:
            if t['type'] == 'deposit' and t['timestamp'] >= start_time:
                user_totals[t['user_id']] = user_totals.get(t['user_id'], 0) + t['amount']
        results = [{'user_id': uid, 'total': total} for uid, total in user_totals.items()]
        
    elif mode == 'wins':
        user_totals = {}
        for bet in game_bets:
            if bet.get('won') and bet['timestamp'] >= start_time:
                user_totals[bet['user_id']] = user_totals.get(bet['user_id'], 0) + bet.get('win_amount', 0)
        results = [{'user_id': uid, 'total': total} for uid, total in user_totals.items()]
    
    results.sort(key=lambda x: x['total'], reverse=True)
    results = results[:limit]
    
    leaderboard = []
    for idx, result in enumerate(results, 1):
        user = get_user(result['user_id'])
        if user:
            leaderboard.append({
                'rank': idx,
                'user_id': user.user_id,
                'username': user.username,
                'first_name': user.first_name,
                'photo_url': user.photo_url,
                'value': result['total']
            })
    
    return leaderboard

async def start_game_round():
    round_id = f"round_{int(time.time())}"
    game_state['current_round'] = {
        'id': round_id,
        'start_time': time.time(),
        'participants': {'blue': [], 'red': [], 'green': []}
    }
    game_state['countdown'] = 7
    
    await broadcast_message({
        'type': 'round_start',
        'countdown': 7
    })
    
    for i in range(7, 0, -1):
        await asyncio.sleep(1)
        game_state['countdown'] = i
        await broadcast_message({
            'type': 'countdown',
            'time': i
        })
    
    await end_game_round()

async def end_game_round():
    colors = ['blue'] * 49 + ['red'] * 49 + ['green'] * 2
    winning_color = random.choice(colors)
    
    game_state['history'].insert(0, winning_color)
    if len(game_state['history']) > 100:
        game_state['history'] = game_state['history'][:100]
    
    round_data = game_state['current_round']
    participants = round_data['participants']
    
    multipliers = {'blue': 2, 'red': 2, 'green': 10}
    
    game_bets = load_json(GAME_BETS_FILE, [])
    
    for color, bets in participants.items():
        for bet in bets:
            user = get_user(bet['user_id'])
            if not user:
                continue
            
            user.total_risk += bet['amount']
            
            if color == winning_color:
                win_amount = bet['amount'] * multipliers[color]
                user.balance += win_amount
                
                game_bets.append({
                    'user_id': user.user_id,
                    'round_id': round_data['id'],
                    'color': color,
                    'amount': bet['amount'],
                    'won': True,
                    'win_amount': win_amount,
                    'timestamp': datetime.now().isoformat()
                })
            else:
                game_bets.append({
                    'user_id': user.user_id,
                    'round_id': round_data['id'],
                    'color': color,
                    'amount': bet['amount'],
                    'won': False,
                    'win_amount': 0,
                    'timestamp': datetime.now().isoformat()
                })
            
            update_user(user)
    
    save_json(GAME_BETS_FILE, game_bets)
    
    await broadcast_message({
        'type': 'round_end',
        'winning_color': winning_color,
        'history': game_state['history']
    })
    
    game_state['participants'] = {'blue': [], 'red': [], 'green': []}
    game_state['current_round'] = None
    
    await asyncio.sleep(2)
    await start_game_round()

async def broadcast_message(message):
    for ws in list(game_state['active_connections']):
        try:
            await ws.send_json(message)
        except:
            game_state['active_connections'].discard(ws)

@dp.message(Command("start"))
async def cmd_start(message: types.Message):
    user_id = message.from_user.id
    user = get_user(user_id)
    
    referrer_id = None
    if message.text and len(message.text.split()) > 1:
        try:
            referrer_id = int(message.text.split()[1])
            if referrer_id == user_id:
                referrer_id = None
        except:
            pass
    
    if not user:
        photos = await bot.get_user_profile_photos(user_id, limit=1)
        photo_url = ""
        if photos.photos:
            photo_url = photos.photos[0][-1].file_id
        
        user = create_user(
            user_id=user_id,
            username=message.from_user.username or "",
            first_name=message.from_user.first_name,
            photo_url=photo_url,
            referrer_id=referrer_id
        )
        
        if referrer_id:
            referrer = get_user(referrer_id)
            if referrer:
                referrer.referrals.append(user_id)
                update_user(referrer)
    
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text="🎮 Играть",
            web_app=WebAppInfo(url=WEBAPP_URL)
        )]
    ])
    
    await message.answer(
        f"🎰 Добро пожаловать в Casino Bot!\n\n"
        f"Играй, выигрывай и получай реальные TON!\n"
        f"Приглашай друзей и получай 10% от их пополнений!",
        reply_markup=keyboard
    )

@dp.message(Command("admin"))
async def cmd_admin(message: types.Message):
    if message.from_user.id not in ADMIN_IDS:
        return
    
    users = load_json(USERS_FILE, [])
    transactions = load_json(TRANSACTIONS_FILE, [])
    
    users_24h = len([u for u in users if u['joined_at'] >= (datetime.now() - timedelta(hours=24)).isoformat()])
    total_dep = sum(t['amount'] for t in transactions if t['type'] == 'deposit')
    
    await message.answer(
        f"📊 Статистика бота\n\n"
        f"👥 Всего пользователей: {len(users)}\n"
        f"🆕 За 24 часа: {users_24h}\n"
        f"💰 Всего пополнено: {total_dep:.2f} TON\n\n"
        f"⚙️ Настройки:\n"
        f"Min депозит TON: {settings.min_deposit_ton}\n"
        f"Min депозит Stars: {settings.min_deposit_stars}\n"
        f"Min вывод: {settings.min_withdrawal}\n"
        f"Курс Stars: {settings.stars_to_ton_rate}\n"
        f"Реф процент: {settings.referral_percent}%"
    )

async def handle_websocket(request):
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    
    game_state['active_connections'].add(ws)
    
    await ws.send_json({
        'type': 'init',
        'history': game_state['history'],
        'countdown': game_state['countdown']
    })
    
    try:
        async for msg in ws:
            if msg.type == web.WSMsgType.TEXT:
                data = json.loads(msg.data)
                
                if data['type'] == 'place_bet':
                    user_id = data['user_id']
                    color = data['color']
                    amount = data['amount']
                    
                    user = get_user(user_id)
                    if user and user.balance >= amount and game_state['current_round']:
                        user.balance -= amount
                        update_user(user)
                        
                        bet = {
                            'user_id': user_id,
                            'username': user.username,
                            'amount': amount
                        }
                        game_state['current_round']['participants'][color].append(bet)
                        
                        await broadcast_message({
                            'type': 'bet_placed',
                            'color': color,
                            'participants': game_state['current_round']['participants']
                        })
                        
                        await ws.send_json({
                            'type': 'bet_success',
                            'balance': user.balance
                        })
                    else:
                        await ws.send_json({
                            'type': 'bet_error',
                            'message': 'Недостаточно средств'
                        })
                
                elif data['type'] == 'get_user':
                    user_id = data['user_id']
                    user = get_user(user_id)
                    if user:
                        await ws.send_json({
                            'type': 'user_data',
                            'user': asdict(user)
                        })
                
                elif data['type'] == 'get_leaderboard':
                    period = data.get('period', '24h')
                    mode = data.get('mode', 'activity')
                    leaderboard = get_leaderboard(period, mode)
                    await ws.send_json({
                        'type': 'leaderboard',
                        'data': leaderboard
                    })
    
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        game_state['active_connections'].discard(ws)
    
    return ws

async def handle_deposit(request):
    data = await request.json()
    user_id = data['user_id']
    amount = data['amount']
    method = data['method']
    
    if method == 'stars':
        amount_ton = amount * settings.stars_to_ton_rate
        if amount < settings.min_deposit_stars:
            return web.json_response({'success': False, 'error': 'Минимальная сумма 120 Stars'})
    else:
        amount_ton = amount
        if amount < settings.min_deposit_ton:
            return web.json_response({'success': False, 'error': 'Минимальная сумма 1 TON'})
    
    success = await process_deposit(user_id, amount_ton, method)
    return web.json_response({'success': success})

async def handle_withdrawal(request):
    data = await request.json()
    user_id = data['user_id']
    amount = data['amount']
    address = data['address']
    
    success = await process_withdrawal(user_id, amount, address)
    
    if success:
        user = get_user(user_id)
        await bot.send_message(
            user_id,
            "✅ Заявка на вывод отправлена!\n\n"
            f"💰 Сумма: {amount} TON\n"
            f"📍 Адрес: {address}\n\n"
            "Ожидайте одобрения администратора. Спасибо за терпение!"
        )
        return web.json_response({'success': True})
    else:
        return web.json_response({'success': False, 'error': 'Недостаточно средств'})

async def handle_promo(request):
    data = await request.json()
    user_id = data['user_id']
    code = data['code']
    
    success, message = await use_promo_code(user_id, code)
    return web.json_response({'success': success, 'message': message})

async def handle_admin_stats(request):
    users = load_json(USERS_FILE, [])
    transactions = load_json(TRANSACTIONS_FILE, [])
    
    users_24h = len([u for u in users if u['joined_at'] >= (datetime.now() - timedelta(hours=24)).isoformat()])
    total_dep = sum(t['amount'] for t in transactions if t['type'] == 'deposit')
    total_with = sum(t['amount'] for t in transactions if t['type'] == 'withdrawal')
    
    return web.json_response({
        'total_users': len(users),
        'users_24h': users_24h,
        'total_deposited': total_dep,
        'total_withdrawn': total_with
    })

async def handle_admin_withdrawals(request):
    withdrawals = load_json(WITHDRAWALS_FILE, [])
    pending = [w for w in withdrawals if w['status'] == 'pending']
    return web.json_response(pending)

async def handle_approve_withdrawal(request):
    withdrawal_id = request.match_info['id']
    withdrawals = load_json(WITHDRAWALS_FILE, [])
    
    for w in withdrawals:
        if w['id'] == withdrawal_id:
            w['status'] = 'approved'
            break
    
    save_json(WITHDRAWALS_FILE, withdrawals)
    return web.json_response({'success': True})

async def start_web_server():
    app = web.Application()
    
    cors = aiohttp_cors.setup(app, defaults={
        "*": aiohttp_cors.ResourceOptions(
            allow_credentials=True,
            expose_headers="*",
            allow_headers="*",
        )
    })
    
    app.router.add_get('/ws', handle_websocket)
    app.router.add_post('/api/deposit', handle_deposit)
    app.router.add_post('/api/withdrawal', handle_withdrawal)
    app.router.add_post('/api/promo', handle_promo)
    app.router.add_get('/admin/stats', handle_admin_stats)
    app.router.add_get('/admin/withdrawals', handle_admin_withdrawals)
    app.router.add_post('/admin/withdrawal/{id}/approve', handle_approve_withdrawal)
    
    for route in list(app.router.routes()):
        cors.add(route)
    
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '0.0.0.0', 8080)
    await site.start()
    print("🚀 Web server started on port 8080")

async def main():
    await start_web_server()
    asyncio.create_task(start_game_round())
    print("🎰 Casino Bot started!")
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())