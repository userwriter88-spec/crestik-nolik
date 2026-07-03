const socket = io();

const cells = document.querySelectorAll('.cell');
const statusText = document.getElementById('status');
const resetBtn = document.getElementById('reset-btn');

let currentPlayer = "X";
let gameState = ["", "", "", "", "", "", "", "", ""];
let gameActive = true;
let myRole = ""; // 'X', 'O' или 'viewer'

// ПОЛНЫЙ МАССИВ КОМБИНАЦИЙ (ТЕПЕРЬ ВСЁ НА МЕСТЕ)
const winningConditions = [
    [0, 1, 2], // Горизонтали
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6], // Вертикали
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8], // Диагонали
    [2, 4, 6]
];

// Обработка клика по ячейке
cells.forEach(cell => {
    cell.addEventListener('click', () => {
        const cellIndex = cell.getAttribute('data-index');

        // Ходить можно, только если игра активна, ячейка пуста и сейчас именно ваш ход
        if (!gameActive || gameState[cellIndex] !== "" || currentPlayer !== myRole) {
            return;
        }

        // Делаем ход локально
        makeMove(cell, cellIndex);

        // Отправляем ход сопернику через сервер
        socket.emit('player-move', cellIndex);

        // Проверяем, не выиграли ли мы от этого хода
        const isWin = checkWin();
        
        // Если выиграли, отправляем серверу индекс победной линии для синхронизации анимации
        if (isWin) {
            const conditionIndex = getWinningConditionIndex();
            if (conditionIndex !== -1) {
                socket.emit('player-won', conditionIndex);
            }
        }
    });
});

// Функция фиксации хода на экране и в памяти (ВОЗВРАЩЕНЫ ЦВЕТА И КЛАССЫ)
function makeMove(cell, cellIndex) {
    gameState[cellIndex] = currentPlayer;
    cell.innerText = currentPlayer;
    cell.classList.add('taken');
    
    // Добавляем класс стиля в нижнем регистре ('x' или 'o') для правильного цвета
    cell.classList.add(currentPlayer.toLowerCase());
    
    // Смена текущего игрока
    currentPlayer = currentPlayer === "X" ? "O" : "X";
    statusText.innerText = currentPlayer === myRole ? 'Ваш ход!' : 'Ход соперника...';
}

// Ловим ход соперника с сервера
socket.on('server-move', (cellIndex) => {
    const cell = document.querySelector(`[data-index='${cellIndex}']`);
    if (cell) {
        makeMove(cell, cellIndex);
    }
});

// Получение индекса выигрышной комбинации для линии
function getWinningConditionIndex() {
    for (let i = 0; i < winningConditions.length; i++) {
        const [a, b, c] = winningConditions[i];
        const val = gameState[a];
        if (val !== "" && val === gameState[b] && val === gameState[c]) {
            return i;
        }
    }
    return -1;
}

// Проверка условий окончания игры (ИСПРАВЛЕНО)
function checkWin() {
    let roundWon = false;
    let winConditionIndex = -1;

    for (let i = 0; i < winningConditions.length; i++) {
        const winCondition = winningConditions[i];
        let a = gameState[winCondition[0]];
        let b = gameState[winCondition[1]];
        let c = gameState[winCondition[2]];

        if (a === '' || b === '' || c === '') {
            continue;
        }
        if (a === b && b === c) {
            roundWon = true;
            winConditionIndex = i;
            break;
        }
    }

    if (roundWon) {
        const winner = currentPlayer === "X" ? "O" : "X";
        statusText.innerText = winner === myRole ? 'Вы победили!' : `Победил ${winner}!`;
        gameActive = false;
        
        // Отрисовка линии локально
        if (typeof drawWinningLine === 'function' && winConditionIndex !== -1) {
            drawWinningLine(winConditionIndex);
        }

        // Показываем кнопку реванша
        resetBtn.style.display = 'block';
        return true;
    }

    // Проверка на ничью
    if (!gameState.includes("")) {
        statusText.innerText = "Ничья!";
        gameActive = false;
        
        // Показываем кнопку реванша
        resetBtn.style.display = 'block';
        return true;
    }

    return false;
}

// Ловим анимацию победной линии от соперника, если выиграл он
socket.on('server-win', (conditionIndex) => {
    gameActive = false;
    const winner = currentPlayer === "X" ? "O" : "X";
    statusText.innerText = winner === myRole ? 'Вы победили!' : `Победил ${winner}!`;
    
    // Функция отрисовки линии из файла line.js
    if (typeof drawWinningLine === 'function') {
        drawWinningLine(conditionIndex);
    }
    
    // Показываем кнопку реванша
    resetBtn.style.display = 'block';
});

// === СЕТЕВАЯ ЛОГИКА РОЛЕЙ ===

socket.on('player-role', (role) => {
    myRole = role;
    if (role === 'viewer') {
        statusText.innerText = 'Вы зритель. Игра уже идет.';
        gameActive = false;
    } else {
        statusText.innerText = `Вы играете за: ${myRole}. Ожидание соперника...`;
        gameActive = false; 
    }
});

socket.on('game-start', (msg) => {
    gameActive = true;
    statusText.innerText = currentPlayer === myRole ? 'Ваш ход!' : 'Ход соперника...';
});

socket.on('player-disconnected', (msg) => {
    statusText.innerText = msg;
    gameActive = false;
    resetBtn.style.display = 'none';
});

// === СЕТЕВАЯ ЛОГИКА КНОПКИ РЕВАНША ===

resetBtn.addEventListener('click', () => {
    socket.emit('request-restart');
    resetBtn.innerText = 'Ожидание соперника...';
    resetBtn.disabled = true;
});

socket.on('opponent-wants-restart', (msg) => {
    statusText.innerText = msg;
});

socket.on('server-restart', () => {
    resetBtn.style.display = 'none';
    resetBtn.innerText = 'Начать заново';
    resetBtn.disabled = false;

    gameState = ["", "", "", "", "", "", "", "", ""];
    currentPlayer = "X"; 
    gameActive = true;

    statusText.innerText = currentPlayer === myRole ? 'Ваш ход!' : 'Ход соперника...';

    // Очищаем ячейки на экране (ИСПРАВЛЕНО: Стираем классы цвета 'x' и 'o')
    cells.forEach(cell => {
        cell.innerText = "";
        cell.classList.remove('taken', 'x', 'o');
    });

    // Очищаем canvas с победной линией
    const canvas = document.getElementById('line-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
});
