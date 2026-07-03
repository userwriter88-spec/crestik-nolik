const express = require('express');
const app = express();
const http = require('http').createServer(app);
// ИСПРАВЛЕНИЕ: Разрешаем только протокол polling, который LocalTunnel не может заблокировать
const io = require('socket.io')(http, {
    transports: ['polling'],
    cors: { origin: "*" }
});

app.use(express.static(__dirname));

let players = {}; // Объект для хранения игроков: { socketId: 'X' или 'O' }

io.on('connection', (socket) => {
    console.log('Пользователь подключился: ' + socket.id);

    // Логика распределения по ролям
    let hasX = Object.values(players).includes('X');
    let hasO = Object.values(players).includes('O');

    if (!hasX) {
        players[socket.id] = 'X';
        socket.emit('player-role', 'X');
    } else if (!hasO) {
        players[socket.id] = 'O';
        socket.emit('player-role', 'O');
    } else {
        socket.emit('player-role', 'viewer');
    }

    // Если теперь на сервере есть и X, и O — запускаем игру
    hasX = Object.values(players).includes('X');
    hasO = Object.values(players).includes('O');
    if (hasX && hasO) {
        io.emit('game-start', 'Игра началась!');
    }

    // Пересылка ходов
    socket.on('player-move', (cellIndex) => {
        socket.broadcast.emit('server-move', cellIndex);
    });

    // Пересылка победы для синхронизации салюта
    socket.on('player-won', (conditionIndex) => {
        socket.broadcast.emit('server-win', conditionIndex);
    });

    // Очистка при обновлении страницы или дисконнекте
    socket.on('disconnect', () => {
        console.log('Пользователь отключился: ' + socket.id);
        
        if (players[socket.id]) {
            delete players[socket.id];
            io.emit('player-disconnected', 'Ваш соперник ушел. Игра окончена.');
            players = {}; // Обнуляем комнату для корректного перезапуска при F5
        }
    });
});

// Запуск сервера на порту 3000
const PORT = 3000;
http.listen(PORT, () => {
    console.log(`Сервер успешно запущен! Откройте в браузере: http://localhost:${PORT}`);
});
