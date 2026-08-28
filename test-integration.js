// ИНТЕГРАЦИОННЫЙ ТЕСТ: КОМНАТЫ С ПАРОЛЕМ
const http = require('http');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');

const PORT = 3099;
let passed = 0, failed = 0;
let errors = [];

function assert(cond, msg) {
    if (cond) { passed++; }
    else { failed++; errors.push(msg); console.log(`  \x1b[31m\u2717 ${msg}\x1b[0m`); }
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

function connect() {
    return new Promise((res, rej) => {
        const s = io(`http://localhost:${PORT}`, { transports: ['polling'] });
        s.on('connect', () => res(s));
        s.on('connect_error', rej);
    });
}

async function main() {
    console.log('=== ИНТЕГРАЦИОННЫЙ ТЕСТ: ПАРОЛИ И КОМНАТЫ ===\n');

    const srv = spawn('node', ['server.js'], { cwd: __dirname, env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
    await wait(3000);

    try {
        const [sA, sB, sC] = await Promise.all([connect(), connect(), connect()]);
        const tokenA = 'tokA_' + Math.random().toString(36).slice(2, 8);
        const tokenB = 'tokB_' + Math.random().toString(36).slice(2, 8);
        sA.emit('auth-session', tokenA);
        sB.emit('auth-session', tokenB);
        sC.emit('auth-session', 'tokC');
        await wait(500);

        // ===========================================================
        console.log('=== ТЕСТ 1: Неверный пароль не удаляет комнату ===');
        let listA = null, listC = null;
        sA.on('room-list', (l) => { listA = l; });
        sC.on('room-list', (l) => { listC = l; });

        sA.emit('create-room', { name: 'secret-room', password: '123' });
        await wait(500);
        assert(listA && listA.some(r => r.name === 'secret-room'), '1.1 Комната secret-room создана');

        let errB = null;
        sB.on('room-error', (m) => { errB = m; });
        sB.emit('join-room', { name: 'secret-room', password: 'wrong', asViewer: false });
        await wait(500);
        assert(errB === 'Неверный пароль', '1.2 B получил "Неверный пароль"');

        listA = null;
        sA.emit('get-rooms');
        await wait(500);
        assert(listA && listA.some(r => r.name === 'secret-room'), '1.3 Комната существует после неверного пароля');
        const room1 = listA.find(r => r.name === 'secret-room');
        assert(room1 && room1.players.X === true, '1.4 Игрок X всё ещё в комнате');
        console.log(`  \x1b[32mОК (${4}/${4})\x1b[0m\n`);

        // ===========================================================
        console.log('=== ТЕСТ 2: Правильный пароль — успешный вход ===');
        let joinedB = null;
        let gameStarted = false;
        sB.on('room-joined', (d) => { joinedB = d; });
        sB.on('game-start', () => { gameStarted = true; });
        errB = null;
        sB.emit('join-room', { name: 'secret-room', password: '123', asViewer: false });
        await wait(500);
        assert(errB === null, '2.1 B не получил ошибку');
        assert(joinedB !== null && joinedB.roomName === 'secret-room', '2.2 B вошёл в комнату');
        assert(joinedB.role === 'O', '2.3 B получил роль O');
        assert(gameStarted, '2.4 Игра началась');
        console.log(`  \x1b[32mОК (${4}/${4})\x1b[0m\n`);

        // ===========================================================
        console.log('=== ТЕСТ 3: Наблюдатель с паролем ===');
        let joinedC = null;
        let roleC = null;
        sC.on('room-joined', (d) => { joinedC = d; });
        sC.on('player-role', (r) => { roleC = r; });
        sC.emit('join-room', { name: 'secret-room', password: '123', asViewer: true });
        await wait(500);
        assert(joinedC !== null && joinedC.roomName === 'secret-room', '3.1 C вошёл как наблюдатель');
        assert(joinedC.role === 'viewer', '3.2 C получил роль viewer');
        listC = null;
        sC.emit('get-rooms');
        await wait(500);
        const roomC = listC && listC.find(r => r.name === 'secret-room');
        assert(roomC && roomC.viewerCount > 0, '3.3 C учтён в viewerCount');
        console.log(`  \x1b[32mОК (${3}/${3})\x1b[0m\n`);

        // ===========================================================
        console.log('=== ТЕСТ 4: Наблюдатель с неверным паролем ===');
        let errC = null;
        sC.on('room-error', (m) => { errC = m; });
        sC.emit('join-room', { name: 'secret-room', password: 'wrong', asViewer: true });
        await wait(500);
        assert(errC === 'Неверный пароль', '4.1 C получил ошибку (наблюдатель)');
        listA = null;
        sA.emit('get-rooms');
        await wait(500);
        assert(listA && listA.some(r => r.name === 'secret-room'), '4.2 Комната не удалилась');
        console.log(`  \x1b[32mОК (${2}/${2})\x1b[0m\n`);

        // ===========================================================
        console.log('=== ТЕСТ 5: Игра и история ===');
        let historyA = null;
        sA.on('update-history', (h) => { historyA = h; });
        sA.emit('player-move', 0);
        await wait(200);
        sB.emit('player-move', 1);
        await wait(200);
        sA.emit('player-move', 3);
        await wait(200);
        sB.emit('player-move', 4);
        await wait(200);
        sA.emit('player-move', 6);
        await wait(500);
        assert(historyA !== null, '5.1 История обновлена');
        assert(historyA.length > 0, '5.2 История не пуста');
        const lastGame = historyA[historyA.length - 1];
        assert(lastGame.winner === 'X', '5.3 Победитель X');
        console.log(`  \x1b[32mОК (${3}/${3})\x1b[0m\n`);

        // ===========================================================
        console.log('=== ТЕСТ 6: Чат с историей ===');
        let chatB = null;
        let chatC = null;
        sB.on('broadcast-chat-message', (d) => { chatB = d; });
        sC.on('broadcast-chat-message', (d) => { chatC = d; });
        sA.emit('send-chat-message', 'Привет!');
        await wait(500);
        assert(chatB !== null, '6.1 B получил сообщение');
        assert(chatB.text === 'Привет!', '6.2 Текст сообщения совпадает');
        assert(chatC !== null, '6.3 C (наблюдатель) получил сообщение');

        chatB = null;
        sA.emit('send-chat-message', '<script>alert(1)</script>');
        await wait(500);
        assert(chatB !== null && chatB.text === '&lt;script&gt;alert(1)&lt;/script&gt;', '6.4 XSS теги экранируются (<>&lt;/>)');
        console.log(`  \x1b[32mОК (${4}/${4})\x1b[0m\n`);

        // ===========================================================
        console.log('=== ТЕСТ 7: Выход из комнаты ===');
        sB.emit('leave-room');
        await wait(1500);
        listA = null;
        sA.emit('get-rooms');
        await wait(500);
        const roomAfterB = listA && listA.find(r => r.name === 'secret-room');
        assert(roomAfterB !== null, '7.1 Комната существует после выхода B');

        sA.emit('leave-room');
        await wait(500);
        listC = null;
        sC.emit('get-rooms');
        await wait(500);
        const roomAfterA = listC && listC.find(r => r.name === 'secret-room');
        assert(roomAfterA !== null, '7.2 Комната ещё существует (disconnectTimer 10s)');
        console.log(`  \x1b[32mОК (${2}/${2})\x1b[0m\n`);

        // ===========================================================
        console.log('=== ТЕСТ 8: Комната без пароля ===');
        let joinedA2 = null;
        sA.on('room-joined', (d) => { joinedA2 = d; });
        sA.emit('create-room', { name: 'open-room' });
        await wait(500);
        assert(joinedA2 && joinedA2.roomName === 'open-room', '8.1 A создал и вошёл в комнату без пароля');
        assert(joinedA2.hasPassword === false, '8.2 hasPassword = false');

        let joinedB2 = null;
        sB.on('room-joined', (d) => { joinedB2 = d; });
        sB.emit('join-room', { name: 'open-room', password: null, asViewer: false });
        await wait(500);
        assert(joinedB2 && joinedB2.roomName === 'open-room', '8.3 B вошёл без пароля');
        console.log(`  \x1b[32mОК (${3}/${3})\x1b[0m\n`);

        // ===========================================================
        console.log('=== ТЕСТ 9: Неверный пароль × 3 подряд ===');
        sB.emit('leave-room');
        sA.emit('leave-room');
        sC.emit('leave-room');
        await wait(1500);

        let errCount = 0;
        sC.on('room-error', () => { errCount++; });
        sC.emit('join-room', { name: 'secret-room', password: 'wrong1', asViewer: false });
        await wait(100);
        sC.emit('join-room', { name: 'secret-room', password: 'wrong2', asViewer: false });
        await wait(100);
        sC.emit('join-room', { name: 'secret-room', password: 'wrong3', asViewer: false });
        await wait(500);
        assert(errCount >= 2, `9.1 Получено ошибок: ${errCount}`);

        listA = null;
        sA.emit('get-rooms');
        await wait(500);
        assert(listA && listA.some(r => r.name === 'secret-room'), '9.2 Комната жива после 3 неверных паролей');
        console.log(`  \x1b[32mОК (${2}/${2})\x1b[0m\n`);

        // ===========================================================
        console.log('==================================================');
        console.log(`ИТОГО: ${passed} пройдено, ${failed} провалено`);
        if (failed > 0) {
            console.log('\nОшибки:');
            errors.forEach(e => console.log(`  - ${e}`));
            process.exit(1);
        }

        sA.close(); sB.close(); sC.close();
    } catch (e) {
        console.error('КРИТИЧЕСКАЯ ОШИБКА:', e.message + '\n' + e.stack?.split('\n').slice(0, 5).join('\n'));
        process.exit(1);
    }

    srv.kill();
    process.exit(0);
}

main();
