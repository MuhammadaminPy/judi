const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

const userId = tg.initDataUnsafe?.user?.id || 123456789;
const username = tg.initDataUnsafe?.user?.username || 'user';
const firstName = tg.initDataUnsafe?.user?.first_name || 'User';

let ws = null;
let userData = null;
let currentBetAmount = 100;
let walletConnected = false;
let currentPage = 'gamePage';

// 🔧 ВАЖНО: Замените на ваш реальный домен сервера!
// Варианты:
// 1. VPS с доменом: const BACKEND_URL = 'your-domain.com';
// 2. Ngrok (для тестирования): const BACKEND_URL = 'abc123.ngrok.io';
// 3. Railway/Render: const BACKEND_URL = 'your-app.railway.app';

const BACKEND_URL = 'https://quinsied-undeliberatively-kerry.ngrok-free.dev/'; // ⚠️ ИЗМЕНИТЕ ЭТО!

// Автоматически определяем протокол (WSS для HTTPS, WS для HTTP)
const WS_URL = `wss://${BACKEND_URL}/ws`;
const API_URL = `https://${BACKEND_URL}/api`;

// Альтернативный вариант (если фронтенд и бэкенд на одном домене):
// const isSecure = window.location.protocol === 'https:';
// const wsProtocol = isSecure ? 'wss:' : 'ws:';
// const httpProtocol = isSecure ? 'https:' : 'http:';
// const WS_URL = `${wsProtocol}//${window.location.hostname}/ws`;
// const API_URL = `${httpProtocol}//${window.location.hostname}/api`;

function connectWebSocket() {
    ws = new WebSocket(WS_URL);
    
    ws.onopen = () => {
        console.log('✅ WebSocket connected');
        ws.send(JSON.stringify({
            type: 'get_user',
            user_id: userId
        }));
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
    };
    
    ws.onclose = () => {
        console.log('❌ WebSocket disconnected');
        setTimeout(connectWebSocket, 3000);
    };
    
    ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        tg.showAlert('⚠️ Ошибка подключения к серверу. Проверьте настройки.');
    };
}

function handleWebSocketMessage(data) {
    switch(data.type) {
        case 'init':
            updateHistory(data.history);
            updateCountdown(data.countdown);
            break;
            
        case 'countdown':
            updateCountdown(data.time);
            break;
            
        case 'round_start':
            resetRound();
            updateCountdown(data.countdown);
            break;
            
        case 'round_end':
            showWinner(data.winning_color);
            updateHistory(data.history);
            setTimeout(resetRound, 2000);
            break;
            
        case 'bet_placed':
            updateParticipants(data.participants);
            break;
            
        case 'bet_success':
            userData.balance = data.balance;
            updateBalance();
            tg.showAlert('✅ Ставка принята!');
            break;
            
        case 'bet_error':
            tg.showAlert('❌ ' + data.message);
            break;
            
        case 'user_data':
            userData = data.user;
            updateUserInterface();
            break;
            
        case 'leaderboard':
            displayLeaderboard(data.data);
            break;
    }
}

function updateCountdown(time) {
    const minutes = Math.floor(time / 60);
    const seconds = time % 60;
    document.getElementById('countdown').textContent = 
        `${minutes.toString().padStart(2, '0')}.${seconds.toString().padStart(2, '0')}`;
}

function updateHistory(history) {
    const historyDots = document.getElementById('historyDots');
    historyDots.innerHTML = '';
    
    const counts = {blue: 0, red: 0, green: 0};
    
    history.slice(-100).forEach(color => {
        const dot = document.createElement('div');
        dot.className = `history-dot ${color}`;
        historyDots.appendChild(dot);
        counts[color]++;
    });
    
    document.getElementById('blueCount').textContent = counts.blue;
    document.getElementById('redCount').textContent = counts.red;
    document.getElementById('greenCount').textContent = counts.green;
}

function updateParticipants(participants) {
    document.getElementById('blueParticipants').textContent = participants.blue || 0;
    document.getElementById('greenParticipants').textContent = participants.green || 0;
    document.getElementById('redParticipants').textContent = participants.red || 0;
    
    document.getElementById('blueUsers').textContent = participants.blue || 0;
    document.getElementById('greenUsers').textContent = participants.green || 0;
    document.getElementById('redUsers').textContent = participants.red || 0;
    
    const total = (participants.blue || 0) + (participants.green || 0) + (participants.red || 0);
    document.getElementById('allUsers').textContent = total;
}

function resetRound() {
    document.querySelectorAll('.dice').forEach(dice => {
        dice.className = 'dice';
    });
    updateParticipants({blue: 0, green: 0, red: 0});
}

function showWinner(color) {
    document.querySelectorAll('.dice').forEach(dice => {
        dice.classList.add(color);
    });
    
    const banner = document.getElementById('rollingBanner');
    banner.style.backgroundColor = getColorHex(color);
    banner.textContent = `WINNER: ${color.toUpperCase()}!`;
    
    setTimeout(() => {
        banner.style.backgroundColor = '';
        banner.innerHTML = 'ROLLING IN <span id="countdown">07.00</span>';
    }, 2000);
}

function getColorHex(color) {
    const colors = {
        blue: '#3b82f6',
        red: '#ef4444',
        green: '#10b981'
    };
    return colors[color] || '#000';
}

function updateUserInterface() {
    if (!userData) return;
    
    document.getElementById('balance').textContent = userData.balance.toFixed(2);
    document.getElementById('profileBalance').textContent = userData.balance.toFixed(2);
    document.getElementById('profileName').textContent = userData.first_name;
    document.getElementById('profileUsername').textContent = '@' + userData.username;
    document.getElementById('profileId').textContent = userData.user_id;
    document.getElementById('totalDeposited').textContent = userData.total_deposited.toFixed(2) + ' TON';
    document.getElementById('totalWithdrawn').textContent = userData.total_withdrawn.toFixed(2) + ' TON';
    document.getElementById('totalRisk').textContent = userData.total_risk.toFixed(2) + ' TON';
    document.getElementById('joinedDate').textContent = new Date(userData.joined_at).toLocaleDateString();
    
    if (userData.photo_url) {
        document.getElementById('userPhoto').src = userData.photo_url;
        document.getElementById('profilePhoto').src = userData.photo_url;
    }
    
    const botUsername = 'YOUR_BOT_USERNAME'; // ⚠️ ИЗМЕНИТЕ на username вашего бота
    const refLink = `https://t.me/${botUsername}?start=ref_${userData.user_id}`;
    document.getElementById('refLink').value = refLink;
    document.getElementById('refCount').textContent = userData.referrals.length;
    document.getElementById('refEarned').textContent = userData.referral_earnings.toFixed(2) + ' TON';
}

function updateBalance() {
    if (!userData) return;
    document.getElementById('balance').textContent = userData.balance.toFixed(2);
    document.getElementById('profileBalance').textContent = userData.balance.toFixed(2);
}

document.querySelectorAll('.amount-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        
        switch(action) {
            case 'min':
                currentBetAmount = 100;
                break;
            case 'half':
                currentBetAmount = Math.max(100, Math.floor(currentBetAmount / 2));
                break;
            case 'double':
                currentBetAmount = Math.min(userData?.balance || 1000, currentBetAmount * 2);
                break;
            case 'max':
                currentBetAmount = userData?.balance || 1000;
                break;
        }
        
        document.getElementById('betAmount').textContent = currentBetAmount;
    });
});

document.querySelectorAll('.pick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const color = btn.dataset.color;
        placeBet(color);
    });
});

function placeBet(color) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        tg.showAlert('❌ Нет соединения с сервером');
        return;
    }
    
    if (!userData || userData.balance < currentBetAmount) {
        tg.showAlert('❌ Недостаточно средств');
        return;
    }
    
    ws.send(JSON.stringify({
        type: 'place_bet',
        user_id: userId,
        color: color,
        amount: currentBetAmount
    }));
}

document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const page = btn.dataset.page;
        showPage(page);
        
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });
});

function showPage(pageName) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    document.getElementById(pageName).classList.add('active');
    currentPage = pageName;
    
    if (pageName === 'leaderboardPage') {
        loadLeaderboard('24h');
    }
}

document.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const period = btn.dataset.period;
        loadLeaderboard(period);
        
        document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });
});

function loadLeaderboard(period) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    ws.send(JSON.stringify({
        type: 'get_leaderboard',
        period: period
    }));
}

function displayLeaderboard(data) {
    const list = document.getElementById('leaderboardList');
    list.innerHTML = '';
    
    data.forEach((user, index) => {
        const item = document.createElement('div');
        item.className = 'leaderboard-item';
        
        const medal = index < 3 ? ['🥇', '🥈', '🥉'][index] : `#${index + 1}`;
        
        item.innerHTML = `
            <div class="rank-number">${medal}</div>
            <div class="user-info">
                <img src="${user.photo_url || 'default-avatar.png'}" alt="${user.first_name}">
                <div>
                    <div class="user-name">${user.first_name}</div>
                    <div class="user-username">@${user.username}</div>
                </div>
            </div>
            <div class="user-score">${user.score} TON</div>
        `;
        
        list.appendChild(item);
    });
}

document.getElementById('depositBtn').addEventListener('click', () => {
    document.getElementById('depositModal').classList.add('active');
});

document.getElementById('withdrawBtn').addEventListener('click', () => {
    document.getElementById('withdrawModal').classList.add('active');
});

document.getElementById('closeDeposit').addEventListener('click', () => {
    document.getElementById('depositModal').classList.remove('active');
});

document.getElementById('closeWithdraw').addEventListener('click', () => {
    document.getElementById('withdrawModal').classList.remove('active');
});

document.querySelectorAll('.deposit-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const method = tab.dataset.method;
        
        document.querySelectorAll('.deposit-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        document.querySelectorAll('.deposit-method').forEach(m => m.classList.remove('active'));
        document.getElementById(method + 'Deposit').classList.add('active');
    });
});

document.getElementById('depositStarsBtn').addEventListener('click', async () => {
    const amount = parseInt(document.getElementById('starsAmount').value);
    
    if (!amount || amount < 120) {
        tg.showAlert('❌ Минимальная сумма: 120 Stars');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/deposit`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                user_id: userId,
                amount: amount,
                method: 'stars'
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            tg.showAlert('✅ Платеж создан! Пожалуйста, оплатите в боте.');
            document.getElementById('depositModal').classList.remove('active');
        } else {
            tg.showAlert('❌ ' + (data.error || 'Ошибка создания платежа'));
        }
    } catch (error) {
        console.error('Deposit error:', error);
        tg.showAlert('❌ Ошибка соединения с сервером');
    }
});

document.getElementById('withdrawSubmitBtn').addEventListener('click', async () => {
    const address = document.getElementById('tonAddress').value;
    const amount = parseFloat(document.getElementById('withdrawAmount').value);
    
    if (!address || !amount) {
        tg.showAlert('❌ Заполните все поля');
        return;
    }
    
    if (amount < 5) {
        tg.showAlert('❌ Минимальная сумма вывода: 5 TON');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/withdrawal`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                user_id: userId,
                address: address,
                amount: amount
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            tg.showAlert('✅ Заявка создана! Ожидайте одобрения.');
            document.getElementById('withdrawModal').classList.remove('active');
            document.getElementById('tonAddress').value = '';
            document.getElementById('withdrawAmount').value = '';
        } else {
            tg.showAlert('❌ ' + (data.error || 'Ошибка создания заявки'));
        }
    } catch (error) {
        console.error('Withdrawal error:', error);
        tg.showAlert('❌ Ошибка соединения с сервером');
    }
});

document.getElementById('copyRefBtn').addEventListener('click', () => {
    const refLink = document.getElementById('refLink');
    refLink.select();
    document.execCommand('copy');
    tg.showAlert('✅ Ссылка скопирована!');
});

document.getElementById('profileBtn').addEventListener('click', () => {
    showPage('profilePage');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-page="profilePage"]').classList.add('active');
});

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎰 Casino Bot initialized');
    console.log('User ID:', userId);
    console.log('WebSocket URL:', WS_URL);
    console.log('API URL:', API_URL);
    
    connectWebSocket();
});
