const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

// Храним токены игроков: { 'X': 'token1', 'O': 'token2' }
let players = { X: null, O: null }; 

// Объект для хранения таймеров дисконнекта: { 'X': timeoutОбъект, 'O': timeoutОбъект }
let disconnectTimers = { X: null, O: null };

// Состояние игрового поля на сервере
let board = Array(9).fill(""); 
let currentTurn = 'X'; // Чей сейчас ход на сервере

let serverScore = {
    X: 0,
    O: 0,
    draws: 0
};

io.on('connection', (socket) => {
    console.log('Пользователь подключился к сокету: ' + socket.id);

    // Игрок сообщает свой токен сессии сразу после подключения
    socket.on('auth-session', (sessionToken) => {
        if (!sessionToken) return;

        let assignedRole = null;

        // 1. Проверяем, не возвращается ли старый игрок X или O по токену
        if (players['X'] === sessionToken) {
            assignedRole = 'X';
        } else if (players['O'] === sessionToken) {
            assignedRole = 'O';
        }

        if (assignedRole) {
            // Восстановление сессии! Отменяем таймер удаления
            if (disconnectTimers[assignedRole]) {
                clearTimeout(disconnectTimers[assignedRole]);
                disconnectTimers[assignedRole] = null;
                socket.broadcast.emit('partner-returned', `Игрок ${assignedRole} вернулся. Продолжаем!`);
                console.log(`Игрок ${assignedRole} успешно вернулся в сессию!`);
            }
        } else {
            // 2. Новый игрок (или токен не совпал) — распределяем свободные роли
            if (!players['X']) {
                players['X'] = sessionToken;
                assignedRole = 'X';
            } else if (!players['O']) {
                players['O'] = sessionToken;
                assignedRole = 'O';
            } else {
                assignedRole = 'viewer';
            }
        }

        // Привязываем роль и токен прямо к текущему сокету
        socket.role = assignedRole;
        socket.sessionToken = sessionToken;

        // Отправляем роль игроку
        socket.emit('player-role', assignedRole);

        // Отправляем текущий счёт
        socket.emit('update-server-score', serverScore);

        // Если это вернувшийся игрок — отправляем ему актуальное состояние поля
        if (assignedRole === 'X' || assignedRole === 'O') {
            socket.emit('restore-board-state', {
                board: board,
                currentTurn: currentTurn
            });
        }

        // Если оба игрока на месте и это старт новой игры (поле пустое)
        if (players['X'] && players['O'] && board.every(cell => cell === "")) {
            io.emit('game-start', 'Игра началась! Ход Х');
        }
    });

    // Изменили прием хода: теперь сервер запоминает его в массив
    socket.on('player-move', (cellIndex) => {
        if (socket.role !== 'X' && socket.role !== 'O') return;
        
        // Проверяем, что ячейка свободна и ход сделан в свою очередь
        if (board[cellIndex] === "" && currentTurn === socket.role) {
            board[cellIndex] = socket.role;
            currentTurn = currentTurn === 'X' ? 'O' : 'X'; // Меняем ход на сервере
            
            // Рассылаем ход всем, кроме отправителя
            socket.broadcast.emit('server-move', cellIndex);
        }
    });

    socket.on('game-over-winner', (winner) => {
        if (winner === 'X' || winner === 'O') {
            serverScore[winner]++;
        } else if (winner === 'draw') {
            serverScore.draws++;
        }
        io.emit('update-server-score', serverScore);
    });

    socket.on('player-restart-request', () => {
        socket.broadcast.emit('partner-wants-restart');
    });

    socket.on('restart-decision', (agreed) => {
        if (agreed) {
            board = Array(9).fill(""); 
            currentTurn = 'X';
            io.emit('game-force-restart');
        } else {
            socket.broadcast.emit('partner-refused-restart');
        }
    });

        // === ЛОГИКА ЧАТА НА СЕРВЕРЕ ===
    socket.on('send-chat-message', (text) => {
        if (!text || text.trim() === "") return;

        // Защита от взлома верстки (экранирование тегов < и >)
        const safeText = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");

        const messageData = {
            role: socket.role || 'viewer', // Роль отправителя (X, O или viewer)
            text: safeText
        };

        // Отправляем сообщение абсолютно ВСЕМ участникам в комнате
        io.emit('broadcast-chat-message', messageData);
    });

    socket.on('disconnect', () => {
        const role = socket.role;
        console.log(`Пользователь отключился: ${socket.id} (Роль: ${role})`);
        
        if (role === 'X' || role === 'O') {
            // Оповещаем соперника, что у него есть 10 секунд
            socket.broadcast.emit('partner-disconnected-waiting', 'Соперник отключился. Ожидаем возвращения (10 сек)...');

            // Запускаем таймер на 10 секунд
            disconnectTimers[role] = setTimeout(() => {
                console.log(`Время ожидания игрока ${role} истекло. Сброс комнаты.`);
                
                // Полностью удаляем сессию игрока
                delete players[role];
                disconnectTimers[role] = null;
                
                // Полный сброс игры для оставшегося игрока
                board = Array(9).fill(""); 
                currentTurn = 'X';
                io.emit('player-disconnected', 'Ваш соперник ушел окончательно. Игра окончена.');
                
                serverScore = { X: 0, O: 0, draws: 0 };
            }, 10000); // 10000 мс = 10 секунд
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
