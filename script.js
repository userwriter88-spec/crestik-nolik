// Подключаемся к нашему серверу Node.js
const socket = io({
    transports: ['polling']
});

// === ГЕНЕРАЦИЯ И ОТПРАВКА СЕССИИ ===
// Берем старый токен или создаем новый случайный id сессии
let sessionToken = sessionStorage.getItem('tic_tac_toe_session');
if (!sessionToken) {
    sessionToken = 'user_' + Math.random().toString(36).slice(2, 11);
    sessionStorage.setItem('tic_tac_toe_session', sessionToken);
}

// Сразу же авторизуемся на сервере с этим токеном
socket.emit('auth-session', sessionToken);

const board = document.getElementById('board');
const cells = document.querySelectorAll('.cell');
const statusText = document.getElementById('status');
const restartBtn = document.getElementById('restart');
const strikeLine = document.getElementById('strike-line');
const fireworks = document.getElementById('fireworks');
const modeToggle = document.getElementById('mode-toggle');

let currentPlayer = 'X';
let gameState = ["", "", "", "", "", "", "", "", ""];
let isGameActive = true; // Для ИИ ставим true по умолчанию
let gameMode = 'pvp'; // 'pvp' (сеть) или 'pve' (против ИИ)

// Сетевые переменные
let myRole = 'X'; // Для ИИ мы всегда Х
let isMyTurn = true; // Для ИИ мы ходим первыми

let winsX = 0; let winsO = 0; let draws = 0;
const scoreXText = document.getElementById('scoreX');
const scoreOText = document.getElementById('scoreO');
const scoreDrawsText = document.getElementById('scoreDraws');

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

// === СЕТЕВАЯ ЛОГИКА ===

// 1. Получаем роль от сервера при входе
socket.on('player-role', (role) => {
    // Слушаем сервер, только если мы в режиме СЕТЕВОЙ игры
    if (gameMode !== 'pvp') return;
    
    myRole = role;
    if (myRole === 'viewer') {
        statusText.innerText = 'Комната полная. Вы — наблюдатель';
    } else {
        statusText.innerText = `Ожидание соперника... Вы играете за: ${myRole}`;
        isGameActive = false; // Ждем старта от сервера

        // Переопределяем очередь ходов при перезаходе: X всегда ходит первым
        isMyTurn = (myRole === 'X'); 
    }
});

// 2. Сервер сообщает, что подключилось двое и игра началась
socket.on('game-start', (msg) => {
    if (gameMode !== 'pvp') return;
    isGameActive = true;
    isMyTurn = (myRole === 'X');
    updateStatusMessage();
});

// 3. Принимаем ход от соперника из сети
socket.on('server-move', (cellIndex) => {
    if (gameMode !== 'pvp') return;
    makeMove(cellIndex);
    isMyTurn = true; 
    updateStatusMessage();
});

// 4: Окончательный дисконнект по истечении 10 секунд
socket.on('player-disconnected', (msg) => {
    if (gameMode !== 'pvp') return;
    statusText.innerText = msg;
    isGameActive = false;
    clearBoardForNewGame(); // Автоматически очищаем поле
});

// 5. Партнер предлагает начать новую партию
socket.on('partner-wants-restart', () => {
    if (gameMode !== 'pvp') return;

    // Выводим текст и добавляем класс btn-choice для красивого стиля
    statusText.innerHTML = `
        <span>Соперник предлагает начать заново:</span>
        <button id="restart-yes" class="btn-choice">Да</button>
        <button id="restart-no" class="btn-choice">Нет</button>
    `;

    // Навешиваем событие на кнопку "Да" (once: true — автоматическое удаление после клика)
    document.getElementById('restart-yes').addEventListener('click', () => {
        socket.emit('restart-decision', true);
    }, { once: true });

    // Навешиваем событие на кнопку "Нет" (once: true — автоматическое удаление после клика)
    document.getElementById('restart-no').addEventListener('click', () => {
        socket.emit('restart-decision', false);
        
        // Показываем сообщение об отказе, не убивая весь DOM
        statusText.innerHTML = '<span style="color: #e74c3c; font-weight: bold;">Вы отказались от игры. Вкладку можно закрыть.</span>';
        document.getElementById('board').style.pointerEvents = 'none';
    }, { once: true });
});

// 6. Получена команда от сервера на запуск новой партии (без перезагрузки страницы!)
socket.on('game-force-restart', () => {
    if (gameMode !== 'pvp') return;
    clearBoardForNewGame();
});

// 7. Если соперник нажал "Нет" — выводим сообщение инициатору
socket.on('partner-refused-restart', () => {
    if (gameMode !== 'pvp') return;
    statusText.innerText = "Соперник отказался от новой игры";
    isGameActive = false;
});

// 8. Получение актуального счёта от сервера
socket.on('update-server-score', (score) => {
    if (gameMode !== 'pvp') return;

    // Синхронизируем переменные клиента с сервером
    winsX = score.X;
    winsO = score.O;
    draws = score.draws;

    // Выводим в интерфейс
    scoreXText.innerText = winsX;
    scoreOText.innerText = winsO;
    scoreDrawsText.innerText = draws;
});

// 9. сервер возвращает состояние поля после F5
socket.on('restore-board-state', (data) => {
    if (gameMode !== 'pvp') return;

    // Синхронизируем локальный массив и текущего игрока
    gameState = data.board;
    currentPlayer = data.currentTurn;
    
    // Перерисовываем поле на экране на основе полученных данных
    gameState.forEach((symbol, index) => {
        const cell = document.querySelector(`.cell[data-index="${index}"]`);
        cell.innerText = symbol;
        cell.classList.remove('x-player', 'o-player');
        if (symbol === 'X') cell.classList.add('x-player');
        if (symbol === 'O') cell.classList.add('o-player');
    });

    // Пересчитываем активность игры и чья очередь ходить
    isGameActive = true;
    isMyTurn = (myRole === currentPlayer);
    updateStatusMessage();
});

// Новое событие: соперник нажал F5, но мы ждем его возвращения
socket.on('partner-disconnected-waiting', (msg) => {
    if (gameMode !== 'pvp') return;
    statusText.innerText = msg;
    isGameActive = false; // Временно блокируем ходы, пока он не переподключится
});

// 10. Событие: соперник вернулся в игру до истечения 10 секунд
socket.on('partner-returned', (msg) => {
    if (gameMode !== 'pvp') return;
    
    isGameActive = true; // Снова активируем поле для кликов
    
    // Жёстко переписываем текст интерфейса, чтобы надпись ожидания исчезла
    if (isMyTurn) {
        statusText.innerText = `Ваш ход (${myRole})`;
    } else {
        const partnerRole = myRole === 'X' ? 'O' : 'X';
        statusText.innerText = `Ход соперника (${partnerRole})`;
    }
});

// === ОБЩАЯ ЛОГИКА ИНТЕРФЕЙСА ===

function updateStatusMessage() {
    if (!isGameActive) return;
    
    if (gameMode === 'pve') {
        statusText.innerText = `Ходят ${currentPlayer}`;
    } else {
        if (isMyTurn) {
            statusText.innerText = `Ваш ход (${myRole})`;
        } else {
            statusText.innerText = `Ход соперника (${currentPlayer})`;
        }
    }
}

function handleCellClick(event) {
    const clickedCell = event.target;
    const clickedCellIndex = parseInt(clickedCell.getAttribute('data-index'));

    if (gameState[clickedCellIndex] !== "" || !isGameActive) return;

    // В СЕТЕВОМ режиме проверяем, наш ли сейчас ход
    if (gameMode === 'pvp' && !isMyTurn) return;
    
    // В режиме ИИ блокируем клики, когда думает бот (ходит за О)
    if (gameMode === 'pve' && currentPlayer === 'O') return;

    // Делаем ход локально у себя на экране
    makeMove(clickedCellIndex);
    
    if (gameMode === 'pvp') {
        // Отправляем ход в сеть
        socket.emit('player-move', clickedCellIndex);
        isMyTurn = false;
        updateStatusMessage();
    } else if (gameMode === 'pve' && isGameActive && currentPlayer === 'O') {
        // Если играем с ИИ и раунд продолжается — даем ход боту
        setTimeout(() => {
            const aiIndex = getBestMove(gameState);
            if (aiIndex !== null) {
                makeMove(aiIndex);
            }
        }, 500);
    }
}

function makeMove(index) {
    gameState[index] = currentPlayer;
    const cell = document.querySelector(`.cell[data-index="${index}"]`);
    cell.innerText = currentPlayer;
    
    if (currentPlayer === 'X') {
        cell.classList.add('x-player');
        playSound('clickX');
    } else {
        cell.classList.add('o-player');
        playSound('clickO');
    }

    checkForWinner();
}

function checkLine(a, b, c) {
    return gameState[a] !== "" && gameState[a] === gameState[b] && gameState[b] === gameState[c];
}

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
        drawStrikeLine(type); // Вызываем функцию из line.js
        fireworks.style.display = 'block';
        playSound('win');

        // === ЛОГИКА ДЛЯ СЕТИ (Отправка победы на сервер) ===
        if (gameMode === 'pvp') {
            // Чтобы сервер не получал два запроса, отправляет только тот, кто сам сделал этот победный ход
            if (myRole === currentPlayer) {
                socket.emit('game-over-winner', currentPlayer);
            }
        } else {
            // Локальный счет (для PvE режима с ботом)
            if (currentPlayer === 'X') {
                winsX++; scoreXText.innerText = winsX;
            } else {
                winsO++; scoreOText.innerText = winsO;
            }
        }
        return;
    }

    if (!gameState.includes("")) {
        statusText.innerText = "Ничья!";
        isGameActive = false;
        
        // === ЛОГИКА ДЛЯ СЕТИ (Отправка ничьей на сервер) ===
        if (gameMode === 'pvp') {
            // Отправляет только тот, чей ход только что был (myRole === currentPlayer более надёжно, чем isMyTurn)
            if (myRole === currentPlayer) {
                socket.emit('game-over-winner', 'draw');
            }
        } else {
            // Локальный счет для PvE
            draws++; scoreDrawsText.innerText = draws;
        }
        return;
    }

    currentPlayer = currentPlayer === "X" ? "O" : "X";
    updateStatusMessage();
}

function restartGame() {
    currentPlayer = 'X';
    gameState = ["", "", "", "", "", "", "", "", ""];

    if (gameMode === 'pve') {
        isGameActive = true;
        myRole = 'X';
        isMyTurn = true;
        statusText.innerText = `Ходят ${currentPlayer}`;
        
        cells.forEach(cell => {
            cell.innerText = "";
            cell.classList.remove('x-player', 'o-player');
        });
        strikeLine.style.display = 'none';
        fireworks.style.display = 'none';
    } else {
        // === ЛОГИКА ДЛЯ СЕТИ ===
        isGameActive = false; 
        statusText.innerText = "Ожидаем ответ соперника";
        
        // Отправляем запрос на сервер
        socket.emit('player-restart-request');
    }
}

// Функция, которая полностью сбрасывает состояние игры на клиенте
function clearBoardForNewGame() {
    // 1. Сбрасываем логику ходов и массив поля
    currentPlayer = 'X';
    gameState = ["", "", "", "", "", "", "", "", ""];
    isGameActive = true;
    
    // 2. Определяем, твой ли ход (Игрок X всегда ходит первым)
    isMyTurn = (myRole === 'X'); 

    // 3. Визуально очищаем все ячейки поля
    cells.forEach(cell => {
        cell.innerText = "";
        cell.classList.remove('x-player', 'o-player');
    });

    // 4. Прячем победную линию, салюты и обновляем статусную строку
    if (typeof strikeLine !== 'undefined') strikeLine.style.display = 'none';
    if (typeof fireworks !== 'undefined') fireworks.style.display = 'none';
    
    updateStatusMessage();
}

// Логика переключателя
modeToggle.addEventListener('change', () => {
    if (modeToggle.checked) {
        gameMode = 'pve'; // Включаем ИИ
    } else {
        gameMode = 'pvp'; // Включаем Сеть
        window.location.reload(); // Перезагружаем для чистого сетевого коннекта
    }
    resetScore();
    restartGame();
});

function resetScore() {
    winsX = 0; winsO = 0; draws = 0;
    scoreXText.innerText = 0; scoreOText.innerText = 0; scoreDrawsText.innerText = 0;
}

cells.forEach(cell => cell.addEventListener('click', handleCellClick));
restartBtn.addEventListener('click', restartGame);

// === ЛОГИКА ЧАТА НА КЛИЕНТЕ ===
const chatContainer = document.getElementById('chat-container');
const chatToggleBtn = document.getElementById('chat-toggle-btn');
const chatCloseBtn = document.getElementById('chat-close-btn');
const chatBadge = document.getElementById('chat-badge');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');
const chatToast = document.getElementById('chat-toast'); // Элемент пуша

let unreadCount = 0;
let isChatOpen = false; 
chatContainer.classList.add('chat-closed');

// Открыть чат
chatToggleBtn.addEventListener('click', () => {
    chatContainer.classList.remove('chat-closed');
    isChatOpen = true;
    unreadCount = 0; 
    chatBadge.classList.add('badge-hidden');
    chatInput.focus();
});

// Свернуть чат
chatCloseBtn.addEventListener('click', () => {
    chatContainer.classList.add('chat-closed');
    isChatOpen = false;
});

// Отправка сообщения
function sendChatMessage() {
    const text = chatInput.value.trim();
    if (text === "") return;

    socket.emit('send-chat-message', text);
    chatInput.value = "";
}

chatSendBtn.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChatMessage();
});

// Принимаем сообщение от сервера
socket.on('broadcast-chat-message', (data) => {
    const msgElement = document.createElement('div');
    msgElement.classList.add('chat-msg');

    let prefix = '';
    let roleClass = 'viewer';
    if (data.role === 'X') { prefix = '[Игрок X]'; roleClass = 'x'; }
    else if (data.role === 'O') { prefix = '[Игрок O]'; roleClass = 'o'; }
    else { prefix = '[Зритель]'; roleClass = 'viewer'; }

    const prefixSpan = document.createElement('span');
    prefixSpan.classList.add(`chat-msg-${roleClass}`);
    prefixSpan.textContent = `${prefix}:`;

    const textSpan = document.createElement('span');
    textSpan.textContent = ` ${data.text}`;

    msgElement.appendChild(prefixSpan);
    msgElement.appendChild(textSpan);
    chatMessages.appendChild(msgElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // ЛОГИКА УВЕДОМЛЕНИЙ ДЛЯ ЗАКРЫТОГО ЧАТА
    if (!isChatOpen) {
        const isMobile = window.innerWidth <= 768;

        if (isMobile) {
            // НА МОБИЛКЕ: Показываем аккуратный всплывающий Push сверху
            chatToast.innerHTML = `💬 <b>${prefix}:</b> ${data.text}`;
            chatToast.classList.remove('toast-hidden');

            // Через 4 секунды автоматически прячем уведомление
            setTimeout(() => {
                chatToast.classList.add('toast-hidden');
            }, 4000);

            // Обновляем циферку непрочитанных на круглой кнопке
            unreadCount++;
            chatBadge.innerText = unreadCount;
            chatBadge.classList.remove('badge-hidden');
        } else {
            // НА ПК: Оставляем автоматическое открытие, так как там оно не мешает
            chatContainer.classList.remove('chat-closed');
            isChatOpen = true;
        }
    }
});


