const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);

app.use(express.static(__dirname));

let players = {};
let restartRequests = []; // Массив для сбора голосов за реванш

io.on('connection', (socket) => {
    console.log('Пользователь подключился: ' + socket.id);

    // Распределение ролей
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

    hasX = Object.values(players).includes('X');
    hasO = Object.values(players).includes('O');
    if (hasX && hasO) {
        io.emit('game-start', 'Игра началась!');
    }

    // Пересылка ходов
    socket.on('player-move', (cellIndex) => {
        socket.broadcast.emit('server-move', cellIndex);
    });

    // Синхронизация победы
    socket.on('player-won', (conditionIndex) => {
        socket.broadcast.emit('server-win', conditionIndex);
    });

    // ЛОГИКА РЕВАНША
    socket.on('request-restart', () => {
        if (!players[socket.id]) return; // Зрители не голосуют

        if (!restartRequests.includes(socket.id)) {
            restartRequests.push(socket.id);
        }

        if (restartRequests.length === 1) {
            // Говорим оппоненту, что первый игрок нажал "Начать заново"
            socket.broadcast.emit('opponent-wants-restart', 'Соперник хочет начать заново!');
        } else if (restartRequests.length === 2) {
            restartRequests = []; // Обнуляем голоса
            io.emit('server-restart'); // Команда обоим клиентам на полный сброс
        }
    });

    // Отключение
    socket.on('disconnect', () => {
        console.log('Пользователь отключился: ' + socket.id);
        if (players[socket.id]) {
            delete players[socket.id];
            io.emit('player-disconnected', 'Ваш соперник ушел. Игра окончена.');
            players = {};
            restartRequests = []; // Сброс при выходе игрока
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
