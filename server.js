const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

let players = {}; 

// === ГЛОБАЛЬНЫЙ СЧЁТ НА СЕРВЕРЕ ===
let serverScore = {
    X: 0,
    O: 0,
    draws: 0
};

io.on('connection', (socket) => {
    console.log('Пользователь подключился: ' + socket.id);

    // 1. ПУЛЕНЕПРОБИВАЕМОЕ РАСПРЕДЕЛЕНИЕ РОЛЕЙ
    // Сначала проверяем, не освободилось ли место X или O
    if (!players['X']) {
        players['X'] = socket.id;
        socket.role = 'X'; // Записываем роль прямо в объект сокета
        socket.emit('player-role', 'X');
    } else if (!players['O']) {
        players['O'] = socket.id;
        socket.role = 'O'; // Записываем роль прямо в объект сокета
        socket.emit('player-role', 'O');
    } else {
        socket.role = 'viewer';
        socket.emit('player-role', 'viewer');
    }

    // Если оба основных игрока на месте — запускаем игру
    if (players['X'] && players['O']) {
        io.emit('game-start', 'Игра началась! Ход Х');
    }

    // Сразу отправляем текущий счёт сервера
    socket.emit('update-server-score', serverScore);

    // Обработка ходов
    socket.on('player-move', (data) => {
        socket.broadcast.emit('server-move', data);
    });

    // Обновление счёта при завершении игры
    socket.on('game-over-winner', (winner) => {
        if (winner === 'X' || winner === 'O') {
            serverScore[winner]++;
        } else if (winner === 'draw') {
            serverScore.draws++;
        }
        io.emit('update-server-score', serverScore);
    });

    // Игрок предложил начать заново
    socket.on('player-restart-request', () => {
        socket.broadcast.emit('partner-wants-restart');
    });

    // Получен ответ от партнера
    socket.on('restart-decision', (agreed) => {
        if (agreed) {
            io.emit('game-force-restart');
        } else {
            socket.broadcast.emit('partner-refused-restart');
        }
    });

    // 2. ИДЕАЛЬНАЯ ОЧИСТКА ПРИ ДИСКОННЕКТЕ
    socket.on('disconnect', () => {
        console.log(`Пользователь отключился: ${socket.id} (Роль: ${socket.role})`);
        
        // Проверяем роль, которую мы привязали к сокету при старте
        if (socket.role === 'X' || socket.role === 'O') {
            // Освобождаем ТОЛЬКО эту роль
            delete players[socket.role];
            
            // Оповещаем оставшегося игрока
            io.emit('player-disconnected', 'Ваш соперник ушел. Игра окончена.');
            
            // Сбрасываем счёт для следующей игровой сессии
            serverScore = { X: 0, O: 0, draws: 0 };
        }
    });
});

const PORT = process.env.PORT || 3000;

http.listen(3000, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
