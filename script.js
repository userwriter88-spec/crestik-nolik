// Подключаемся к нашему серверу Node.js
const socket = io({
    transports: ['polling']
});

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

// 4. Если соперник отключился
socket.on('player-disconnected', (msg) => {
    if (gameMode !== 'pvp') return;
    statusText.innerText = msg;
    isGameActive = false;
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

        if (currentPlayer === 'X') {
            winsX++; scoreXText.innerText = winsX;
        } else {
            winsO++; scoreOText.innerText = winsO;
        }
        return;
    }

    if (!gameState.includes("")) {
        statusText.innerText = "Ничья!";
        isGameActive = false;
        draws++; scoreDrawsText.innerText = draws;
        return;
    }

    currentPlayer = currentPlayer === "X" ? "O" : "X";
    updateStatusMessage();
    document.getElementById('reset-btn').style.display = 'block';
}

function restartGame() {
    currentPlayer = 'X';
    gameState = ["", "", "", "", "", "", "", "", ""];
    
    if (gameMode === 'pve') {
        isGameActive = true;
        myRole = 'X';
        isMyTurn = true;
        statusText.innerText = `Ходят ${currentPlayer}`;
    } else {
        isGameActive = false; // Перезапуск в сети управляется перезагрузкой страниц
        statusText.innerText = "Для перезапуска сетевой игры обновите страницу (F5)";
    }
    
    cells.forEach(cell => {
        cell.innerText = "";
        cell.classList.remove('x-player', 'o-player');
    });

    strikeLine.style.display = 'none';
    fireworks.style.display = 'none';
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

// Клик по кнопке "Начать заново" отправляет запрос на сервер
document.getElementById('reset-btn').addEventListener('click', () => {
    socket.emit('request-restart');
    document.getElementById('reset-btn').innerText = 'Ожидание соперника...';
    document.getElementById('reset-btn').disabled = true;
});

// Если соперник нажал кнопку раньше вас
socket.on('opponent-wants-restart', (msg) => {
    statusText.innerText = msg;
});

// Сервер подтвердил, что оба игрока нажали кнопку
socket.on('server-restart', () => {
    // Возвращаем кнопку в исходное состояние и прячем её
    const resetBtn = document.getElementById('reset-btn');
    resetBtn.style.display = 'none';
    resetBtn.innerText = 'Начать заново';
    resetBtn.disabled = false;

    // Очищаем массив ходов на клиенте
    gameState = ["", "", "", "", "", "", "", "", ""];
    gameActive = true;

    // Делаем все ячейки визуально пустыми
    cells.forEach(cell => {
        cell.innerText = "";
        cell.classList.remove('taken');
    });

    // Сбрасываем текст статуса в зависимости от того, чья сейчас очередь
    // По умолчанию в вашей игре первый ход всегда за X
    statusText.innerText = currentPlayer === 'X' ? 'Ваш ход (X)' : 'Ход соперника (O)';

    // ОЧИСТКА ЛИНИИ ПОБЕДЫ:
    // В вашей игре за линии отвечает canvas. Чтобы стереть линию, очищаем его:
    const canvas = document.getElementById('line-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
});

