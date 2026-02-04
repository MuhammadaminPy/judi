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

const WS_URL = `wss://${window.location.hostname}:8080/ws`;
const API_URL = `https://${window.location.hostname}:8080/api`;

function connectWebSocket() {
    ws = new WebSocket(WS_URL);
    
    ws.onopen = () => {
        console.log('WebSocket connected');
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
        console.log('WebSocket disconnected');
        setTimeout(connectWebSocket, 3000);
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
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
    
    let blueCount = 0;
    let redCount = 0;
    let greenCount = 0;
    
    history.forEach(color => {
        const dot = document.createElement('div');
        dot.className = `history-dot ${color}`;
        historyDots.appendChild(dot);
        
        if (color === 'blue') blueCount++;
        else if (color === 'red') redCount++;
        else if (color === 'green') greenCount++;
    });
    
    document.getElementById('blueCount').textContent = blueCount;
    document.getElementById('redCount').textContent = redCount;
    document.getElementById('greenCount').textContent = greenCount;
}

function updateParticipants(participants) {
    document.getElementById('blueParticipants').textContent = participants.blue.length;
    document.getElementById('greenParticipants').textContent = participants.green.length;
    document.getElementById('redParticipants').textContent = participants.red.length;
    
    document.getElementById('blueUsers').textContent = participants.blue.length;
    document.getElementById('greenUsers').textContent = participants.green.length;
    document.getElementById('redUsers').textContent = participants.red.length;
    
    const totalUsers = participants.blue.length + participants.green.length + participants.red.length;
    document.getElementById('allUsers').textContent = totalUsers;
}

function showWinner(color) {
    const diceContainer = document.getElementById('diceContainer');
    const dices = diceContainer.querySelectorAll('.dice');
    
    dices.forEach(dice => {
        dice.classList.remove('winner');
        if (dice.classList.contains(color)) {
            dice.classList.add('winner');
        }
    });
    
    const banner = document.getElementById('rollingBanner');
    banner.textContent = `WINNER: ${color.toUpperCase()}!`;
    banner.style.background = color === 'blue' ? '#4a9eff' : color === 'red' ? '#ff6b6b' : '#51cf66';
}

function resetRound() {
    const banner = document.getElementById('rollingBanner');
    banner.innerHTML = 'ROLLING IN <span id="countdown">07.00</span>';
    banner.style.background = '#51cf66';
    
    document.getElementById('blueParticipants').textContent = '0';
    document.getElementById('greenParticipants').textContent = '0';
    document.getElementById('redParticipants').textContent = '0';
}

function updateBalance() {
    if (userData) {
        document.getElementById('balance').textContent = userData.balance.toFixed(2);
        document.getElementById('profileBalance').textContent = userData.balance.toFixed(2);
    }
}

function updateUserInterface() {
    if (!userData) return;
    
    updateBalance();
    
    const photoElements = [
        document.getElementById('userPhoto'),
        document.getElementById('profilePhoto')
    ];
    
    photoElements.forEach(el => {
        if (userData.photo_url) {
            el.src = `https://api.telegram.org/file/bot${BOT_TOKEN}/${userData.photo_url}`;
        } else {
            el.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.first_name)}&background=4a9eff&color=fff&size=200`;
        }
    });
    
    document.getElementById('profileName').textContent = userData.first_name;
    document.getElementById('profileUsername').textContent = '@' + (userData.username || 'user');
    document.getElementById('profileId').textContent = userData.user_id;
    
    document.getElementById('totalDeposited').textContent = userData.total_deposited.toFixed(2) + ' TON';
    document.getElementById('totalWithdrawn').textContent = userData.total_withdrawn.toFixed(2) + ' TON';
    document.getElementById('totalRisk').textContent = userData.total_risk.toFixed(2) + ' TON';
    
    const joinedDate = new Date(userData.joined_at);
    document.getElementById('joinedDate').textContent = joinedDate.toLocaleDateString();
    
    const refLink = `https://t.me/YOUR_BOT_USERNAME?start=${userData.user_id}`;
    document.getElementById('refLink').value = refLink;
    
    document.getElementById('refCount').textContent = userData.referrals.length;
    document.getElementById('refEarned').textContent = userData.referral_earnings.toFixed(2) + ' TON';
    
    document.getElementById('languageSelect').value = userData.language;
    document.getElementById('themeSelect').value = userData.theme;
}

document.querySelectorAll('.amount-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        
        switch(action) {
            case 'min':
                currentBetAmount = 10;
                break;
            case 'half':
                currentBetAmount = Math.floor(currentBetAmount / 2);
                break;
            case 'double':
                currentBetAmount = currentBetAmount * 2;
                break;
            case 'max':
                currentBetAmount = userData ? Math.floor(userData.balance) : 1000;
                break;
        }
        
        document.getElementById('betAmount').textContent = currentBetAmount;
    });
});

document.querySelectorAll('.pick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const color = btn.dataset.color;
        
        if (!userData || userData.balance < currentBetAmount) {
            tg.showAlert('❌ Недостаточно средств!');
            return;
        }
        
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'place_bet',
                user_id: userId,
                color: color,
                amount: currentBetAmount
            }));
        }
    });
});

document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const pageName = btn.dataset.page;
        
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });
        
        document.querySelectorAll('.nav-btn').forEach(navBtn => {
            navBtn.classList.remove('active');
        });
        
        document.getElementById(pageName).classList.add('active');
        btn.classList.add('active');
        currentPage = pageName;
        
        if (pageName === 'leaderboardPage') {
            loadLeaderboard('24h', 'activity');
        }
    });
});

document.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const period = btn.dataset.period;
        
        document.querySelectorAll('.period-btn').forEach(b => {
            b.classList.remove('active');
        });
        btn.classList.add('active');
        
        loadLeaderboard(period, 'activity');
    });
});

function loadLeaderboard(period, mode) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'get_leaderboard',
            period: period,
            mode: mode
        }));
    }
}

function displayLeaderboard(data) {
    const list = document.getElementById('leaderboardList');
    list.innerHTML = '';
    
    data.forEach(item => {
        const div = document.createElement('div');
        div.className = 'leaderboard-item';
        
        const rankEmoji = item.rank === 1 ? '🥇' : item.rank === 2 ? '🥈' : item.rank === 3 ? '🥉' : item.rank;
        
        div.innerHTML = `
            <div class="rank-number">${rankEmoji}</div>
            <img class="user-avatar" src="https://ui-avatars.com/api/?name=${encodeURIComponent(item.first_name)}&background=4a9eff&color=fff&size=100" alt="${item.first_name}">
            <div class="user-info">
                <div class="user-name">${item.first_name}</div>
                <div class="user-username">@${item.username || 'user'}</div>
            </div>
            <div class="user-value">${item.value.toFixed(2)}</div>
        `;
        
        list.appendChild(div);
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
        
        document.querySelectorAll('.deposit-tab').forEach(t => {
            t.classList.remove('active');
        });
        tab.classList.add('active');
        
        document.querySelectorAll('.deposit-method').forEach(m => {
            m.classList.remove('active');
        });
        document.getElementById(`${method}Deposit`).classList.add('active');
    });
});

document.getElementById('depositStarsBtn').addEventListener('click', async () => {
    const amount = parseInt(document.getElementById('starsAmount').value);
    
    if (!amount || amount < 120) {
        tg.showAlert('❌ Минимальная сумма 120 Stars');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/deposit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                amount: amount,
                method: 'stars'
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            tg.showAlert('✅ Пополнение успешно!');
            document.getElementById('depositModal').classList.remove('active');
            ws.send(JSON.stringify({ type: 'get_user', user_id: userId }));
        } else {
            tg.showAlert('❌ ' + result.error);
        }
    } catch (error) {
        tg.showAlert('❌ Ошибка при пополнении');
    }
});

document.getElementById('connectWalletBtn').addEventListener('click', () => {
    walletConnected = true;
    document.getElementById('walletStatus').textContent = 'Кошелёк подключен ✅';
    document.getElementById('connectWalletBtn').style.display = 'none';
    document.getElementById('tonAmount').style.display = 'block';
    document.getElementById('depositTonBtn').style.display = 'block';
});

document.getElementById('depositTonBtn').addEventListener('click', async () => {
    const amount = parseFloat(document.getElementById('tonAmount').value);
    
    if (!amount || amount < 1) {
        tg.showAlert('❌ Минимальная сумма 1 TON');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/deposit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                amount: amount,
                method: 'ton'
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            tg.showAlert('✅ Пополнение успешно!');
            document.getElementById('depositModal').classList.remove('active');
            ws.send(JSON.stringify({ type: 'get_user', user_id: userId }));
        } else {
            tg.showAlert('❌ ' + result.error);
        }
    } catch (error) {
        tg.showAlert('❌ Ошибка при пополнении');
    }
});

document.getElementById('withdrawSubmitBtn').addEventListener('click', async () => {
    const address = document.getElementById('tonAddress').value.trim();
    const amount = parseFloat(document.getElementById('withdrawAmount').value);
    
    if (!address) {
        tg.showAlert('❌ Введите адрес кошелька');
        return;
    }
    
    if (!amount || amount < 5) {
        tg.showAlert('❌ Минимальная сумма вывода 5 TON');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/withdrawal`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                amount: amount,
                address: address
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            tg.showAlert('✅ Заявка на вывод отправлена!');
            document.getElementById('withdrawModal').classList.remove('active');
            document.getElementById('tonAddress').value = '';
            document.getElementById('withdrawAmount').value = '';
            ws.send(JSON.stringify({ type: 'get_user', user_id: userId }));
        } else {
            tg.showAlert('❌ ' + result.error);
        }
    } catch (error) {
        tg.showAlert('❌ Ошибка при создании заявки');
    }
});

document.getElementById('copyRefBtn').addEventListener('click', () => {
    const refLink = document.getElementById('refLink');
    refLink.select();
    document.execCommand('copy');
    tg.showAlert('✅ Ссылка скопирована!');
});

document.getElementById('languageSelect').addEventListener('change', (e) => {
    if (userData) {
        userData.language = e.target.value;
    }
});

document.getElementById('themeSelect').addEventListener('change', (e) => {
    if (userData) {
        userData.theme = e.target.value;
        if (e.target.value === 'light') {
            document.documentElement.style.setProperty('--bg-primary', '#f5f5f5');
            document.documentElement.style.setProperty('--bg-secondary', '#ffffff');
            document.documentElement.style.setProperty('--bg-card', '#ffffff');
            document.documentElement.style.setProperty('--text-primary', '#000000');
            document.documentElement.style.setProperty('--text-secondary', '#666666');
        } else {
            document.documentElement.style.setProperty('--bg-primary', '#1a1d29');
            document.documentElement.style.setProperty('--bg-secondary', '#252836');
            document.documentElement.style.setProperty('--bg-card', '#2a2d3a');
            document.documentElement.style.setProperty('--text-primary', '#ffffff');
            document.documentElement.style.setProperty('--text-secondary', '#8a8fa3');
        }
    }
});

connectWebSocket();
