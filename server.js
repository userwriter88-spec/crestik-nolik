const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const { getBestMove } = require('./ai.js');

app.use(express.static(__dirname));

// === ХРАНИЛИЩЕ КОМНАТ ===
const rooms = {};

function createRoom(name, password, aiGame, chatEnabled) {
    rooms[name] = {
        players: { X: null, O: null },
        password: password || null,
        board: Array(9).fill(""),
        currentTurn: 'X',
        score: { X: 0, O: 0, draws: 0 },
        gameOver: false,
        gameStarted: false,
        aiGame: aiGame || false,
        chatEnabled: chatEnabled !== false,
        creatorToken: null,
        disconnectTimers: { X: null, O: null },
        gameHistory: [],
        chatHistory: [],
        viewerTokens: [],
        nextViewerId: 1
    };
}

function getRoomList() {
    return Object.keys(rooms).map(name => ({
        name,
        hasPassword: !!rooms[name].password,
        players: {
            X: !!rooms[name].players.X,
            O: !!rooms[name].players.O
        },
        viewerCount: rooms[name].viewerTokens.length,
        totalParticipants: (!!rooms[name].players.X ? 1 : 0) + (!!rooms[name].players.O ? 1 : 0) + rooms[name].viewerTokens.length,
        gameStarted: rooms[name].gameStarted,
        gameOver: rooms[name].gameOver,
        aiGame: rooms[name].aiGame || false,
        chatEnabled: rooms[name].chatEnabled !== false
    }));
}

function checkServerWin(board) {
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for (const [a,b,c] of lines) {
        if (board[a] !== "" && board[a] === board[b] && board[b] === board[c]) return board[a];
    }
    if (!board.includes("")) return 'draw';
    return null;
}

function getRoleForSocket(room, sessionToken) {
    if (room.players.X === sessionToken) return 'X';
    if (room.players.O === sessionToken) return 'O';
    if (!room.players.X) return 'X';
    if (!room.players.O) return 'O';
    return 'viewer';
}

function addGameToHistory(room, winner, players) {
    room.gameHistory.push({
        winner,
        playerX: players.X || 'неизвестно',
        playerO: players.O || 'неизвестно',
        date: new Date().toLocaleString('ru-RU')
    });
    if (room.gameHistory.length > 50) room.gameHistory.shift();
}

function addChatToHistory(room, data) {
    room.chatHistory.push(data);
    if (room.chatHistory.length > 100) room.chatHistory.shift();
}

io.on('connection', (socket) => {
    console.log('Подключился: ' + socket.id);

    socket.room = null;
    socket.role = null;
    socket.sessionToken = null;

    // === УПРАВЛЕНИЕ КОМНАТАМИ ===

    socket.on('auth-session', (sessionToken) => {
        if (sessionToken) socket.sessionToken = sessionToken;
    });

    socket.on('get-rooms', () => {
        socket.emit('room-list', getRoomList());
    });

    socket.on('create-room', (data) => {
        const roomName = data && data.name;
        const password = data && data.password;
        const aiGame = data && data.aiGame;
        const chatEnabled = data && data.chatEnabled;
        if (!roomName || typeof roomName !== 'string') return;
        const name = roomName.trim().slice(0, 30);
        if (!name) { socket.emit('room-error', 'Некорректное название'); return; }
        if (rooms[name]) { socket.emit('room-error', 'Комната с таким названием уже существует'); return; }

        createRoom(name, password || null, aiGame || false, chatEnabled);
        if (aiGame) rooms[name].creatorToken = socket.sessionToken;
        internalJoin(socket, name, password || null);
        io.emit('room-list', getRoomList());
    });

    socket.on('join-room', (data) => {
        const roomName = data && data.name;
        const password = data && data.password;
        const asViewer = data && data.asViewer;
        if (!roomName || !rooms[roomName]) { socket.emit('room-error', 'Комната не найдена'); return; }
        const room = rooms[roomName];

        // Проверка пароля
        if (room.password && room.password !== password) {
            socket.emit('room-error', 'Неверный пароль');
            return;
        }

        // Если asViewer явно true — принудительно назначаем наблюдателем
        if (asViewer) {
            socket.room = roomName;
            socket.role = 'viewer';
            socket.join(roomName);
            if (!room.viewerTokens.includes(socket.sessionToken)) {
                room.viewerTokens.push(socket.sessionToken);
            }
            socket.viewerId = room.nextViewerId++;
            socket.emit('player-role', 'viewer', socket.viewerId);
            socket.emit('update-server-score', room.score);
            socket.emit('room-joined', { roomName, role: 'viewer', hasPassword: !!room.password, gameHistory: room.gameHistory, chatHistory: room.chatHistory, aiGame: room.aiGame || false, chatEnabled: room.chatEnabled !== false });
            socket.emit('restore-board-state', { board: room.board, currentTurn: room.currentTurn, gameOver: room.gameOver });
            io.emit('room-list', getRoomList());
            return;
        }

        internalJoin(socket, roomName, password || null);
    });

    socket.on('leave-room', () => {
        internalLeave(socket);
    });

    function internalJoin(socket, roomName, password) {
        const room = rooms[roomName];
        if (!room) return;

        // Если уже в другой комнате — выйти
        if (socket.room && socket.room !== roomName) internalLeave(socket);

        let role = getRoleForSocket(room, socket.sessionToken);

        // AI-комнаты: только создатель может быть игроком, остальные — наблюдатели
        if (room.aiGame && role !== 'viewer' && room.creatorToken !== socket.sessionToken) {
            role = 'viewer';
        }

        if (role === 'X') room.players.X = socket.sessionToken;
        else if (role === 'O') room.players.O = socket.sessionToken;
        else if (role === 'viewer') {
            if (!room.viewerTokens.includes(socket.sessionToken)) {
                room.viewerTokens.push(socket.sessionToken);
            }
            socket.viewerId = room.nextViewerId++;
        }

        socket.room = roomName;
        socket.role = role;
        socket.join(roomName);

        socket.emit('player-role', role);
        socket.emit('update-server-score', room.score);
        socket.emit('room-joined', {
            roomName,
            role,
            hasPassword: !!room.password,
            gameHistory: room.gameHistory,
            chatHistory: room.chatHistory,
            aiGame: room.aiGame || false,
            chatEnabled: room.chatEnabled !== false
        });

        if (role === 'X' || role === 'O') {
            if (room.disconnectTimers[role]) {
                clearTimeout(room.disconnectTimers[role]);
                room.disconnectTimers[role] = null;
                io.to(roomName).emit('partner-returned', `Игрок ${role} вернулся. Продолжаем!`);
            }
        }
        socket.emit('restore-board-state', { board: room.board, currentTurn: room.currentTurn, gameOver: room.gameOver });

        tryStartGame(room, roomName);
        io.emit('room-list', getRoomList());
    }

    function internalLeave(socket) {
        if (!socket.room) return;
        const roomName = socket.room;
        const room = rooms[roomName];
        socket.leave(roomName);

        if (room) {
            const role = socket.role;
            if (room.aiGame && (role === 'X' || role === 'O')) {
                io.to(roomName).emit('room-closed', 'Хост покинул игру с ИИ');
                room.players[role] = null;
                delete rooms[roomName];
                socket.room = null;
                socket.role = null;
                io.emit('room-list', getRoomList());
                return;
            }
            if (role === 'X' || role === 'O') {
                io.to(roomName).emit('partner-disconnected-waiting', 'Соперник отключился. Ожидаем возвращения (10 сек)...');

                room.disconnectTimers[role] = setTimeout(() => {
                    const winner = role === 'X' ? 'O' : 'X';
                    const awardWin = room.players[winner] && !room.gameOver;
                    if (awardWin) {
                        room.score[winner]++;
                        addGameToHistory(room, winner, room.players);
                        io.to(roomName).emit('update-server-score', room.score);
                        io.to(roomName).emit('update-history', room.gameHistory);
                    }
                    room.players[role] = null;
                    room.disconnectTimers[role] = null;
                    room.board = Array(9).fill("");
                    room.currentTurn = 'X';
                    room.gameOver = false;
                    room.gameStarted = false;
                    io.to(roomName).emit('player-disconnected', awardWin ? `Игрок ${role} покинул игру. Победа присуждена ${winner}.` : `Игрок ${role} покинул игру.`);

                    if (!room.players.X && !room.players.O) {
                        delete rooms[roomName];
                    }
                    io.emit('room-list', getRoomList());
                }, 10000);
            } else if (role === 'viewer') {
                const idx = room.viewerTokens.indexOf(socket.sessionToken);
                if (idx !== -1) room.viewerTokens.splice(idx, 1);
            }
        }

        socket.room = null;
        socket.role = null;
        io.emit('room-list', getRoomList());
    }

    // === ИГРОВАЯ ЛОГИКА ===

    socket.on('player-move', (cellIndex) => {
        if (!socket.room || !socket.role) return;
        const room = rooms[socket.room];
        if (!room || room.gameOver) return;
        if (socket.role !== 'X' && socket.role !== 'O') return;
        if (typeof cellIndex !== 'number' || cellIndex < 0 || cellIndex > 8) return;

        if (room.board[cellIndex] === "" && room.currentTurn === socket.role) {
            room.board[cellIndex] = socket.role;
            room.currentTurn = socket.role === 'X' ? 'O' : 'X';
            socket.to(socket.room).emit('server-move', cellIndex);

            let result = checkServerWin(room.board);

            // AI-комната: после хода человека ходит бот (O) с задержкой
            if (!result && room.aiGame && socket.role === 'X') {
                const roomName = socket.room;
                setTimeout(() => {
                    const r = rooms[roomName];
                    if (!r || r.gameOver || r.currentTurn !== 'O') return;
                    const aiIndex = getBestMove(r.board);
                    if (aiIndex !== null) {
                        r.board[aiIndex] = 'O';
                        r.currentTurn = 'X';
                        io.to(roomName).emit('server-move', aiIndex);
                        const aiResult = checkServerWin(r.board);
                        if (aiResult) {
                            if (aiResult === 'X' || aiResult === 'O') {
                                r.score[aiResult]++;
                                addGameToHistory(r, aiResult, r.players);
                            } else if (aiResult === 'draw') {
                                r.score.draws++;
                                addGameToHistory(r, 'draw', r.players);
                            }
                            r.gameOver = true;
                            io.to(roomName).emit('update-history', r.gameHistory);
                            io.to(roomName).emit('update-server-score', r.score);
                        }
                    }
                }, 500);
            }

            if (result) {
                if (result === 'X' || result === 'O') {
                    room.score[result]++;
                    addGameToHistory(room, result, room.players);
                } else if (result === 'draw') {
                    room.score.draws++;
                    addGameToHistory(room, 'draw', room.players);
                }
                room.gameOver = true;
                io.to(socket.room).emit('update-history', room.gameHistory);
                io.to(socket.room).emit('update-server-score', room.score);
            }
        }
    });

    socket.on('game-over-winner', (winner) => {
        if (!socket.room) return;
        const room = rooms[socket.room];
        if (!room || room.gameOver) return;
        if (winner === 'X' || winner === 'O') {
            room.score[winner]++;
            addGameToHistory(room, winner, room.players);
        } else if (winner === 'draw') {
            room.score.draws++;
            addGameToHistory(room, 'draw', room.players);
        }
        room.gameOver = true;
        room.gameStarted = false;
        io.to(socket.room).emit('update-history', room.gameHistory);
        io.to(socket.room).emit('update-server-score', room.score);
    });

    socket.on('player-restart-request', () => {
        if (!socket.room) return;
        socket.to(socket.room).emit('partner-wants-restart');
    });

    socket.on('restart-decision', (agreed) => {
        if (!socket.room) return;
        const room = rooms[socket.room];
        if (!room) return;
        if (agreed) {
            room.board = Array(9).fill("");
            room.currentTurn = 'X';
            room.gameOver = false;
            room.gameStarted = false;
            io.to(socket.room).emit('game-force-restart');
        } else {
            socket.to(socket.room).emit('partner-refused-restart');
        }
    });

    // === ЧАТ ===

    socket.on('send-chat-message', (text) => {
        if (!text || text.trim() === "" || !socket.room) return;
        const room = rooms[socket.room];
        if (!room || !room.chatEnabled) return;
        const safeText = text.replace(/</g, "&lt;").replace(/>/g, "&gt;").slice(0, 200);
        const msgData = {
            role: socket.role || 'viewer',
            viewerId: socket.viewerId || null,
            text: safeText,
            time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
            senderId: socket.id
        };
        addChatToHistory(rooms[socket.room], msgData);
        io.to(socket.room).emit('broadcast-chat-message', msgData);
    });

    // === ЧАТ — ПЕЧАТАЕТ ===

    socket.on('chat-typing', () => {
        if (!socket.room) return;
        const room = rooms[socket.room];
        if (!room || !room.chatEnabled) return;
        socket.to(socket.room).emit('chat-typing', socket.role || 'viewer');
    });

    // === ДИСКОННЕКТ ===

    socket.on('disconnect', () => {
        console.log('Отключился: ' + socket.id);
        internalLeave(socket);
    });
});

function tryStartGame(room, roomName) {
    if (room.gameStarted) return;
    if (!room.board.every(c => c === "")) return;
    if (room.aiGame && room.players.X) {
        room.gameStarted = true;
        io.to(roomName).emit('game-start', 'Игра началась! Ход Х');
    } else if (room.players.X && room.players.O) {
        room.gameStarted = true;
        io.to(roomName).emit('game-start', 'Игра началась! Ход Х');
    }
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
