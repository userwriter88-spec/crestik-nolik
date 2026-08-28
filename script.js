const socket = io({ transports: ['polling'] });

// === СЕССИЯ ===
let sessionToken = sessionStorage.getItem('tic_tac_toe_session');
if (!sessionToken) {
    sessionToken = 'user_' + Math.random().toString(36).slice(2, 11);
    sessionStorage.setItem('tic_tac_toe_session', sessionToken);
}
socket.emit('auth-session', sessionToken);

let mySocketId = null;
socket.on('connect', () => {
    mySocketId = socket.id;
});
if (socket.connected) mySocketId = socket.id;

// === DOM ===
const lobbyView = document.getElementById('lobby-view');
const gameView = document.getElementById('game-view');
const roomNameDisplay = document.getElementById('room-name-display');
const leaveRoomBtn = document.getElementById('leave-room-btn');
const createRoomBtn = document.getElementById('create-room-btn');
const roomNameInput = document.getElementById('room-name-input');
const roomPasswordCheck = document.getElementById('room-password-check');
const roomPasswordInput = document.getElementById('room-password-input');
const roomListEl = document.getElementById('room-list');
const roomErrorEl = document.getElementById('room-error');
const playAiBtn = document.getElementById('play-ai-btn');

const passwordModal = document.getElementById('password-modal');
const passwordInput = document.getElementById('password-input');
const passwordOk = document.getElementById('password-ok');
const passwordCancel = document.getElementById('password-cancel');
const passwordError = document.getElementById('password-error');

const roleModal = document.getElementById('role-modal');
const rolePlayerBtn = document.getElementById('role-player');
const roleViewerBtn = document.getElementById('role-viewer');
const roleCancelBtn = document.getElementById('role-cancel');

const board = document.getElementById('board');
const cells = document.querySelectorAll('.cell');
const statusText = document.getElementById('status');
const restartBtn = document.getElementById('restart');
const strikeLine = document.getElementById('strike-line');
const fireworks = document.getElementById('fireworks');
const scoreXText = document.getElementById('scoreX');
const scoreOText = document.getElementById('scoreO');
const scoreDrawsText = document.getElementById('scoreDraws');

const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');
const chatContainer = document.getElementById('chat-container');
const chatToggleBtn = document.getElementById('chat-toggle-btn');
const chatCloseBtn = document.getElementById('chat-close-btn');
const chatBadge = document.getElementById('chat-badge');
const chatToast = document.getElementById('chat-toast');
const roleBadge = document.getElementById('role-badge');
const chatTyping = document.getElementById('chat-typing');

// === СОСТОЯНИЕ ===
let currentPlayer = 'X';
let gameState = ["", "", "", "", "", "", "", "", ""];
let isGameActive = true;
let gameMode = 'pvp';
let myRole = 'X';
let isMyTurn = true;
let winsX = 0, winsO = 0, draws = 0;
let currentRoom = null;
let pendingJoinRoom = null;
let unreadCount = 0;
let isChatOpen = false;
let isAiMode = false;
let isAiRoom = false;

chatContainer.classList.add('chat-closed');

let myViewerId = null;

// === ЛОББИ ===

// Показать лобби при загрузке
socket.emit('get-rooms');

socket.on('room-list', (rooms) => renderRoomList(rooms));

socket.on('room-joined', (data) => {
    currentRoom = data.roomName;
    isAiRoom = data.aiGame || false;
    const chatEnabled = data.chatEnabled !== false;
    if (isAiRoom) {
        roomNameDisplay.textContent = '⚡ Игра с ИИ';
    } else {
        roomNameDisplay.textContent = 'Комната: ' + data.roomName;
    }
    gameMode = 'pvp';
    isAiMode = false;
    chatToggleBtn.classList.toggle('hidden', !chatEnabled);
    chatContainer.classList.add('chat-closed');
    isChatOpen = false;
    if (!chatEnabled) {
        chatToast.classList.add('toast-hidden');
    }
    showGameView();
    createRoomBtn.classList.remove('btn-loading');
    if (data.chatHistory && chatEnabled) {
        chatMessages.innerHTML = '';
        data.chatHistory.forEach(msg => appendChatMessage(msg));
    }
});

socket.on('room-error', (msg) => {
    roomErrorEl.textContent = msg;
    roomErrorEl.classList.remove('hidden');
    setTimeout(() => roomErrorEl.classList.add('hidden'), 3000);
    passwordError.textContent = msg;
    passwordError.classList.remove('hidden');
    setTimeout(() => passwordError.classList.add('hidden'), 2000);
    createRoomBtn.classList.remove('btn-loading');
});



function renderRoomList(rooms) {
    if (!rooms || rooms.length === 0) {
        roomListEl.innerHTML = '<div class="room-list-empty">Нет доступных комнат. Создайте первую!</div>';
        return;
    }
    roomListEl.innerHTML = rooms.map(r => {
        const status = r.gameStarted ? 'Игра идёт' : 'Ожидание';
        const lock = r.hasPassword ? ' 🔒' : '';
        const viewers = r.viewerCount > 0 ? ` | 👁 ${r.viewerCount}` : '';
        const total = r.totalParticipants || 0;
        const isAi = r.aiGame || false;
        const aiBadge = isAi ? ' 🤖' : '';
        const chatBadge = r.chatEnabled !== false ? ' 💬' : ' 🔇';
        const oSlot = isAi ? '🤖' : (r.players.O ? '✅' : '⬜');
        const bothFull = r.players.X && (r.players.O || isAi);
        return `
            <div class="room-item">
                <div class="room-item-info">
                    <strong>${r.name}${lock}${aiBadge}${chatBadge}</strong>
                    <span class="room-item-players">X: ${r.players.X ? '✅' : '⬜'} | O: ${oSlot}${viewers}</span>
                    <span class="room-item-status">${isAi ? '🤖 С ИИ' : status} · ${total} участников</span>
                </div>
                <button class="room-join-btn" data-room="${r.name}" data-haspw="${r.hasPassword}" data-full="${bothFull}">${bothFull ? 'Наблюдать' : 'Войти'}</button>
            </div>
        `;
    }).join('');

    roomListEl.querySelectorAll('.room-join-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const name = btn.dataset.room;
            const hasPw = btn.dataset.haspw === 'true';
            const isFull = btn.dataset.full === 'true';
            pendingJoinRoom = name;
            if (hasPw) {
                passwordInput.value = '';
                passwordError.classList.add('hidden');
                passwordModal.classList.remove('hidden');
                passwordInput.focus();
                window._pendingRoomFull = isFull;
            } else {
                if (isFull) {
                    socket.emit('join-room', { name, asViewer: true });
                } else {
                    roleModalPlayerBtnToggle(true);
                    roleModal.classList.remove('hidden');
                }
            }
        });
    });
}

// === ВЫБОР РОЛИ ===
function roleModalPlayerBtnToggle(show) {
    rolePlayerBtn.classList.toggle('hidden', !show);
}

function joinWithRole(asViewer) {
    roleModal.classList.add('hidden');
    const pw = window._pendingPassword || null;
    window._pendingPassword = null;
    window._pendingRoomFull = false;
    socket.emit('join-room', { name: pendingJoinRoom, password: pw, asViewer });
}

rolePlayerBtn.addEventListener('click', () => joinWithRole(false));
roleViewerBtn.addEventListener('click', () => joinWithRole(true));

roleCancelBtn.addEventListener('click', () => {
    roleModal.classList.add('hidden');
    pendingJoinRoom = null;
});

// === ПАРОЛЬ ===
passwordOk.addEventListener('click', () => {
    const pw = passwordInput.value;
    if (!pw) { passwordError.textContent = 'Введите пароль'; passwordError.classList.remove('hidden'); return; }
    passwordModal.classList.add('hidden');
    window._pendingPassword = pw;
    if (window._pendingRoomFull) {
        socket.emit('join-room', { name: pendingJoinRoom, password: pw, asViewer: true });
        window._pendingRoomFull = false;
        window._pendingPassword = null;
    } else {
        roleModalPlayerBtnToggle(true);
        roleModal.classList.remove('hidden');
    }
});

passwordCancel.addEventListener('click', () => {
    passwordModal.classList.add('hidden');
    pendingJoinRoom = null;
});

passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') passwordOk.click();
});

// === СОЗДАНИЕ КОМНАТЫ ===
createRoomBtn.addEventListener('click', () => {
    const name = roomNameInput.value.trim();
    if (!name) { roomErrorEl.textContent = 'Введите название комнаты'; roomErrorEl.classList.remove('hidden'); setTimeout(() => roomErrorEl.classList.add('hidden'), 2000); return; }
    const password = roomPasswordCheck.checked ? roomPasswordInput.value : '';
    const chatEnabled = document.getElementById('room-chat-check').checked;
    createRoomBtn.classList.add('btn-loading');
    socket.emit('create-room', { name, password: password || undefined, chatEnabled });
    roomNameInput.value = '';
    roomPasswordCheck.checked = false;
    roomPasswordInput.value = '';
    roomPasswordInput.disabled = true;
});

roomNameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') createRoomBtn.click(); });
roomPasswordCheck.addEventListener('change', () => {
    roomPasswordInput.disabled = !roomPasswordCheck.checked;
    if (!roomPasswordCheck.checked) roomPasswordInput.value = '';
});

// === ИГРА ПРОТИВ ИИ ===
playAiBtn.addEventListener('click', () => {
    document.getElementById('ai-modal').classList.remove('hidden');
});

document.getElementById('ai-local').addEventListener('click', () => {
    document.getElementById('ai-modal').classList.add('hidden');
    currentRoom = null;
    roomNameDisplay.textContent = 'Одиночная игра';
    gameMode = 'pve';
    isAiMode = true;
    isAiRoom = false;
    myRole = 'X';
    roleBadge.className = 'role-badge role-badge-x';
    roleBadge.textContent = 'Игрок X';
    chatToggleBtn.classList.add('hidden');
    chatContainer.classList.add('chat-closed');
    isChatOpen = false;
    showGameView();
});

document.getElementById('ai-room').addEventListener('click', () => {
    document.getElementById('ai-modal').classList.add('hidden');
    const aiRoomName = 'AI-' + Math.random().toString(36).slice(2, 8);
    const chatEnabled = document.getElementById('ai-chat-check').checked;
    socket.emit('create-room', { name: aiRoomName, aiGame: true, chatEnabled });
    currentRoom = aiRoomName;
    roomNameDisplay.textContent = '⚡ Игра с ИИ';
    gameMode = 'pvp';
    isAiMode = false;
    isAiRoom = true;
    showGameView();
});

document.getElementById('ai-cancel').addEventListener('click', () => {
    document.getElementById('ai-modal').classList.add('hidden');
});

// === ВЫХОД ИЗ КОМНАТЫ ===
leaveRoomBtn.addEventListener('click', () => {
    if (currentRoom) socket.emit('leave-room');
    currentRoom = null;
    isAiMode = false;
    isAiRoom = false;
    showLobbyView();
});

function showGameView() {
    lobbyView.classList.add('hidden');
    gameView.classList.remove('hidden');
    resetScore();
    clearBoardForNewGame();
    if (!isAiMode) socket.emit('get-rooms');
}

function showLobbyView() {
    gameView.classList.add('hidden');
    lobbyView.classList.remove('hidden');
    socket.emit('get-rooms');
}

// === ИГРОВАЯ ЛОГИКА ===

socket.on('player-role', (role, viewerId) => {
    if (!isAiMode) myRole = role;
    if (viewerId) myViewerId = viewerId;
    roleBadge.className = 'role-badge';
    if (myRole === 'viewer') {
        roleBadge.textContent = 'Наблюдатель';
        roleBadge.classList.add('role-badge-viewer');
        statusText.innerText = 'Вы — наблюдатель';
        isGameActive = false;
        restartBtn.classList.add('hidden');
    } else {
        roleBadge.textContent = `Игрок ${myRole}`;
        roleBadge.classList.add(myRole === 'X' ? 'role-badge-x' : 'role-badge-o');
        restartBtn.classList.remove('hidden');
        if (!isAiMode) {
            statusText.innerText = `Ожидание соперника... Вы играете за: ${myRole}`;
            isGameActive = false;
            isMyTurn = (myRole === 'X');
        }
    }
});

socket.on('game-start', () => {
    if (isAiMode) return;
    if (myRole === 'viewer') {
        isGameActive = true;
        updateStatusMessage();
        return;
    }
    isGameActive = true;
    isMyTurn = (myRole === 'X');
    updateStatusMessage();
});

socket.on('server-move', (cellIndex) => {
    if (isAiMode) return;
    makeMove(cellIndex);
    if (myRole !== 'viewer') isMyTurn = true;
    updateStatusMessage();
});

socket.on('player-disconnected', (msg) => {
    if (isAiMode) return;
    statusText.innerText = msg;
    isGameActive = false;
    clearBoardForNewGame();
});

socket.on('partner-wants-restart', () => {
    if (isAiMode || myRole === 'viewer') return;
    statusText.innerHTML = `
        <span>Соперник предлагает начать заново:</span>
        <button id="restart-yes" class="btn-choice">Да</button>
        <button id="restart-no" class="btn-choice">Нет</button>
    `;
    document.getElementById('restart-yes').addEventListener('click', () => { socket.emit('restart-decision', true); }, { once: true });
    document.getElementById('restart-no').addEventListener('click', () => {
        socket.emit('restart-decision', false);
        statusText.innerHTML = '<span style="color:#e74c3c;font-weight:bold;">Вы отказались от новой игры. Игра продолжается.</span>';
        setTimeout(updateStatusMessage, 1500);
    }, { once: true });
});

socket.on('game-force-restart', () => { if (!isAiMode) clearBoardForNewGame(); });
socket.on('partner-refused-restart', () => { if (!isAiMode) { statusText.innerText = "Соперник отказался от новой игры"; setTimeout(updateStatusMessage, 1500); } });

socket.on('update-server-score', (score) => {
    if (isAiMode) return;
    winsX = score.X; winsO = score.O; draws = score.draws;
    scoreXText.innerText = winsX; scoreOText.innerText = winsO; scoreDrawsText.innerText = draws;
});

socket.on('restore-board-state', (data) => {
    if (isAiMode) return;
    gameState = data.board;
    currentPlayer = data.currentTurn;
    gameState.forEach((symbol, index) => {
        const cell = document.querySelector(`.cell[data-index="${index}"]`);
        cell.innerText = symbol;
        cell.classList.remove('x-player', 'o-player');
        if (symbol === 'X') cell.classList.add('x-player');
        if (symbol === 'O') cell.classList.add('o-player');
    });
    if (data.gameOver) {
        isGameActive = false;
        isMyTurn = false;
        statusText.innerText = 'Игра окончена';
    } else {
        isGameActive = true;
        isMyTurn = (myRole === currentPlayer);
        updateStatusMessage();
    }
});

socket.on('partner-disconnected-waiting', (msg) => { if (!isAiMode) { statusText.innerText = msg; isGameActive = false; } });
socket.on('room-closed', () => {
    if (currentRoom) {
        currentRoom = null;
        isAiRoom = false;
        isAiMode = false;
        showLobbyView();
    }
});
socket.on('partner-returned', () => { if (!isAiMode) { isGameActive = true; statusText.innerText = isMyTurn ? `Ваш ход (${myRole})` : `Ход соперника (${myRole === 'X' ? 'O' : 'X'})`; } });

// === ИГРОВЫЕ ФУНКЦИИ ===

function updateStatusMessage() {
    if (!isGameActive) return;
    if (isAiRoom) {
        if (myRole === 'viewer') {
            statusText.innerText = `Ходят ${currentPlayer}`;
        } else {
            statusText.innerText = isMyTurn ? `Ваш ход (${myRole})` : `Ход ИИ (O)...`;
        }
    } else if (isAiMode || gameMode === 'pve') {
        statusText.innerText = `Ходят ${currentPlayer}`;
    } else {
        statusText.innerText = isMyTurn ? `Ваш ход (${myRole})` : `Ход соперника (${currentPlayer})`;
    }
}

function handleCellClick(event) {
    const clickedCell = event.target;
    const clickedCellIndex = parseInt(clickedCell.getAttribute('data-index'));
    if (gameState[clickedCellIndex] !== "" || !isGameActive) return;
    if (isAiMode) {
        // В режиме ИИ ходит только X (игрок), O ходит автоматом
        if (currentPlayer !== 'X') return;
        makeMove(clickedCellIndex);
        if (isGameActive && currentPlayer === 'O') {
            setTimeout(() => {
                const aiIndex = getBestMove(gameState);
                if (aiIndex !== null) makeMove(aiIndex);
            }, 500);
        }
        return;
    }
    // PvP
    if (!isMyTurn) return;
    makeMove(clickedCellIndex);
    socket.emit('player-move', clickedCellIndex);
    isMyTurn = false;
    updateStatusMessage();
}

function makeMove(index) {
    gameState[index] = currentPlayer;
    const cell = document.querySelector(`.cell[data-index="${index}"]`);
    cell.innerText = currentPlayer;
    if (currentPlayer === 'X') { cell.classList.add('x-player'); playSound('clickX'); }
    else { cell.classList.add('o-player'); playSound('clickO'); }
    checkForWinner();
}

function checkLine(a, b, c) { return gameState[a] !== "" && gameState[a] === gameState[b] && gameState[b] === gameState[c]; }

function checkForWinner() {
    let type = "";
    if (checkLine(0, 1, 2)) type = "horizontal-1";
    else if (checkLine(3, 4, 5)) type = "horizontal-2";
    else if (checkLine(6, 7, 8)) type = "horizontal-3";
    else if (checkLine(0, 3, 6)) type = "vertical-1";
    else if (checkLine(1, 4, 7)) type = "vertical-2";
    else if (checkLine(2, 5, 8)) type = "vertical-3";
    else if (checkLine(0, 4, 8)) type = "main-diagonal";
    else if (checkLine(2, 4, 6)) type = "side-diagonal";

    if (type !== "") {
        statusText.innerText = `Игрок ${currentPlayer} победил!`;
        isGameActive = false;
        drawStrikeLine(type);
        fireworks.style.display = 'block';
        playSound('win');
        if (isAiMode) {
            if (currentPlayer === 'X') { winsX++; scoreXText.innerText = winsX; }
            else { winsO++; scoreOText.innerText = winsO; }
        }
        return;
    }

    if (!gameState.includes("")) {
        statusText.innerText = "Ничья!";
        isGameActive = false;
        if (isAiMode) {
            draws++; scoreDrawsText.innerText = draws;
        }
        return;
    }

    currentPlayer = currentPlayer === "X" ? "O" : "X";
    updateStatusMessage();
}

function restartGame() {
    if (myRole === 'viewer') return;
    if (isAiMode) {
        currentPlayer = 'X';
        gameState = ["", "", "", "", "", "", "", "", ""];
        isGameActive = true;
        myRole = 'X';
        isMyTurn = true;
        statusText.innerText = `Ходят ${currentPlayer}`;
        cells.forEach(c => { c.innerText = ""; c.classList.remove('x-player', 'o-player'); });
        strikeLine.style.display = 'none';
        fireworks.style.display = 'none';
    } else if (isAiRoom && currentRoom) {
        socket.emit('restart-decision', true);
    } else if (currentRoom) {
        statusText.innerText = "Ожидаем ответ соперника";
        socket.emit('player-restart-request');
    }
}

function clearBoardForNewGame() {
    currentPlayer = 'X';
    gameState = ["", "", "", "", "", "", "", "", ""];
    isGameActive = true;
    if (!isAiMode) isMyTurn = (myRole === 'X');
    else isMyTurn = true;
    cells.forEach(c => { c.innerText = ""; c.classList.remove('x-player', 'o-player'); });
    if (typeof strikeLine !== 'undefined') strikeLine.style.display = 'none';
    if (typeof fireworks !== 'undefined') fireworks.style.display = 'none';
    updateStatusMessage();
}

function resetScore() {
    winsX = 0; winsO = 0; draws = 0;
    scoreXText.innerText = 0; scoreOText.innerText = 0; scoreDrawsText.innerText = 0;
}

cells.forEach(cell => cell.addEventListener('click', handleCellClick));
restartBtn.addEventListener('click', restartGame);

function playSound(type) {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode); gainNode.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    if (type === 'clickX') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(600, now); gainNode.gain.setValueAtTime(0.1, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1); osc.start(now); osc.stop(now + 0.1);
    } else if (type === 'clickO') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(450, now); gainNode.gain.setValueAtTime(0.1, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1); osc.start(now); osc.stop(now + 0.1);
    } else if (type === 'win') {
        osc.type = 'triangle'; gainNode.gain.setValueAtTime(0.15, now); gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
        osc.frequency.setValueAtTime(523.25, now); osc.frequency.setValueAtTime(659.25, now + 0.15); osc.frequency.setValueAtTime(783.99, now + 0.3);
        osc.start(now); osc.stop(now + 0.6);
    }
}

// === ЧАТ ===

function playChatSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.connect(gainNode); gainNode.connect(audioCtx.destination);
        const now = audioCtx.currentTime;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        gainNode.gain.setValueAtTime(0.05, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.06);
        osc.start(now); osc.stop(now + 0.06);
    } catch (_) {}
}

function appendChatMessage(data) {
    const el = document.createElement('div');
    el.classList.add('chat-msg');
    const isSelf = data.senderId && data.senderId === mySocketId;
    if (isSelf) el.classList.add('chat-msg-self');
    let prefix = '', rc = 'viewer';
    if (data.role === 'X') { prefix = 'Игрок X'; rc = 'x'; }
    else if (data.role === 'O') { prefix = 'Игрок O'; rc = 'o'; }
    else { prefix = data.viewerId ? `Наблюдатель ${data.viewerId}` : 'Наблюдатель'; rc = 'viewer'; }

    const time = document.createElement('span'); time.classList.add('chat-time'); time.textContent = data.time || '';
    const body = document.createElement('span'); body.classList.add('chat-msg-body');
    const p = document.createElement('span'); p.classList.add(`chat-msg-${rc}`); p.textContent = `${prefix}:`;
    const t = document.createElement('span'); t.textContent = ` ${data.text}`;
    body.appendChild(p); body.appendChild(t);
    el.appendChild(time); el.appendChild(body);

    chatMessages.appendChild(el);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function sendMsg(input) {
    return function() {
        const text = (input?.value || '').trim();
        if (!text) return;
        socket.emit('send-chat-message', text);
        input.value = '';
    };
}

chatSendBtn.addEventListener('click', sendMsg(chatInput));
chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMsg(chatInput)(); });

socket.on('broadcast-chat-message', (data) => {
    appendChatMessage(data);
    hideTyping();
    if (!isChatOpen) {
        playChatSound();
        const label = data.role === 'X' ? 'Игрок X' : data.role === 'O' ? 'Игрок O' : (data.viewerId ? `Наблюдатель ${data.viewerId}` : 'Наблюдатель');
        chatToast.innerHTML = `💬 <b>${label}:</b> ${data.text}`;
        chatToast.classList.remove('toast-hidden');
        setTimeout(() => chatToast.classList.add('toast-hidden'), 4000);
        unreadCount++;
        chatBadge.innerText = unreadCount > 99 ? '99+' : unreadCount;
        chatBadge.classList.remove('badge-hidden');
    }
});

// === ЧАТ — ПЕЧАТАЕТ ===

let typingTimeout = null;
let hideTypingTimer = null;

function hideTyping() {
    chatTyping.classList.add('hidden');
    clearTimeout(hideTypingTimer);
}

chatInput.addEventListener('input', () => {
    if (!chatInput.value.trim()) return;
    socket.emit('chat-typing');
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {}, 3000);
});

socket.on('chat-typing', (role) => {
    const label = role === 'X' ? 'Игрок X' : role === 'O' ? 'Игрок O' : 'Наблюдатель';
    chatTyping.textContent = `${label} печатает...`;
    chatTyping.classList.remove('hidden');
    clearTimeout(hideTypingTimer);
    hideTypingTimer = setTimeout(hideTyping, 3000);
});

chatToggleBtn.addEventListener('click', () => {
    chatContainer.classList.remove('chat-closed');
    isChatOpen = true;
    unreadCount = 0;
    chatBadge.classList.add('badge-hidden');
    chatInput.focus();
    chatMessages.scrollTop = chatMessages.scrollHeight;
    hideTyping();
});

chatCloseBtn.addEventListener('click', () => {
    chatContainer.classList.add('chat-closed');
    isChatOpen = false;
});
