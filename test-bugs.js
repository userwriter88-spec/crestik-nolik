// === ПОЛНЫЙ ТЕСТ НА БАГИ ===
const http = require('http');
const { spawn } = require('child_process');

const PORT = 3096;
let passed = 0, failed = 0;
let errors = [];

function assert(cond, msg) {
    if (cond) { passed++; }
    else { failed++; errors.push(msg); console.log(`  \x1b[31m\u2717 ${msg}\x1b[0m`); }
}

function get(path) {
    return new Promise((res) => {
        http.get(`http://localhost:${PORT}${path}`, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>res({s:r.statusCode,b:d})); }).on('error',()=>res(null));
    });
}

async function main() {
    console.log('=== ЗАПУСК ТЕСТОВ НА БАГИ ===\n');

    const srv = spawn('node', ['server.js'], { cwd: __dirname, env: {...process.env, PORT: String(PORT)}, stdio: 'pipe' });
    await new Promise(r => setTimeout(r, 2000));

    // =====================================================================
    console.log('--- 1. ПРОВЕРКА СТАТИКИ ---');
    const html = await get('/');
    assert(html && html.s === 200, 'GET / → 200');
    assert(html.b.includes('lobby-view'), 'Лобби существует');
    assert(html.b.includes('game-view'), 'Игровое поле существует');
    assert(html.b.includes('play-ai-btn'), 'Кнопка "Играть против ИИ" есть');
    assert(html.b.includes('password-modal'), 'Модалка пароля есть');
    assert(html.b.includes('role-modal'), 'Модалка выбора роли есть');
    assert(html.b.includes('chat-container'), 'Контейнер чата есть');
    assert(html.b.includes('chat-toggle-btn'), 'Кнопка чата есть');
    assert(html.b.includes('chat-messages'), 'Блок сообщений чата есть');
    assert(html.b.includes('chat-input'), 'Поле ввода чата есть');
    assert(!html.b.includes('game-history'), 'Блок истории удалён');
    assert(!html.b.includes('chat-panel'), 'Панель чата в сайдбаре удалена');
    assert(!html.b.includes('mode-toggle-inline'), 'Переключатель ИИ удалён');
    assert(!html.b.includes('game-sidebar'), 'Сайдбар удалён');
    assert(html.b.includes('board'), 'Игровая доска есть');
    assert(html.b.includes('cell'), 'Ячейки поля есть');
    assert(html.b.includes('ai.js'), 'ai.js подключён');
    assert(html.b.includes('line.js'), 'line.js подключён');
    assert(html.b.includes('script.js'), 'script.js подключён');
    assert(html.b.includes('socket.io'), 'socket.io подключён');
    console.log(`  OK\n`);

    // =====================================================================
    console.log('--- 2. ПРОВЕРКА CSS ---');
    const css = await get('/style.css');
    assert(css && css.s === 200, 'style.css → 200');
    assert(css.b.length > 3000, 'CSS не пустой (> 3000 байт)');
    assert(css.b.includes('lobby-card'), 'Стили лобби');
    assert(css.b.includes('modal'), 'Стили модалок');
    assert(css.b.includes('role-btn'), 'Стили кнопок роли');
    assert(css.b.includes('chat-container'), 'Стили контейнера чата');
    assert(css.b.includes('chat-closed'), 'Стили скрытого чата');
    assert(css.b.includes('chat-toggle-btn'), 'Стили кнопки чата');
    assert(css.b.includes('chat-toast'), 'Стили toast-уведомлений');
    assert(css.b.includes('cell'), 'Стили ячеек');
    assert(css.b.includes('strike-line'), 'Стили победной линии');
    assert(css.b.includes('@media'), 'Адаптивность (media queries)');
    console.log(`  OK\n`);

    // =====================================================================
    console.log('--- 3. ПРОВЕРКА JS-ФАЙЛОВ ---');
    const ai = await get('/ai.js');
    assert(ai && ai.s === 200, 'ai.js → 200');
    assert(ai.b.includes('getBestMove'), 'AI: функция getBestMove');
    assert(ai.b.includes('checkAiLine'), 'AI: функция checkAiLine');

    const line = await get('/line.js');
    assert(line && line.s === 200, 'line.js → 200');
    assert(line.b.includes('drawStrikeLine'), 'line.js: функция drawStrikeLine');
    assert(line.b.includes('horizontal-1'), 'line.js: стили для горизонтали');
    assert(line.b.includes('vertical-1'), 'line.js: стили для вертикали');
    assert(line.b.includes('main-diagonal'), 'line.js: стили для диагонали');
    assert(line.b.includes('side-diagonal'), 'line.js: стили для побочной диагонали');

    console.log(`  OK\n`);

    // =====================================================================
    console.log('--- 4. ПРОВЕРКА ЛОГИКИ AI ---');
    // Тестируем ai.js напрямую
    const aiCode = ai.b;
    // Эмулируем функции AI
    let aiOk = 0;
    try {
        eval(aiCode);
        assert(typeof getBestMove === 'function', 'AI: getBestMove загружена');
        
        // Тест 1: AI атакует
        let r = getBestMove(["O","O","","X","X","","","",""]);
        assert(r === 2, `AI атака: ожидалось 2, получено ${r}`);
        if (r === 2) aiOk++;

        // Тест 2: AI защищается
        r = getBestMove(["X","X","","O","","","","",""]);
        assert(r === 2, `AI защита: ожидалось 2, получено ${r}`);
        if (r === 2) aiOk++;

        // Тест 3: AI занимает центр
        r = getBestMove(["","","","","","","","",""]);
        assert(r === 4, `AI центр: ожидалось 4, получено ${r}`);
        if (r === 4) aiOk++;

        // Тест 4: AI не может ходить на занятую
        r = getBestMove(["X","O","X","O","O","X","X","X","O"]);
        assert(r === null, `AI полная доска: ожидался null, получено ${r}`);
        if (r === null) aiOk++;

        // Тест 5: AI атака приоритетнее защиты
        r = getBestMove(["O","O","","X","X","","","",""]);
        assert(r === 2, `AI приоритет атаки: ожидалось 2, получено ${r}`);
        if (r === 2) aiOk++;

        console.log(`  AI тестов пройдено: ${aiOk}/5\n`);
    } catch(e) {
        console.log(`  AI ОШИБКА: ${e.message}\n`);
    }

    // =====================================================================
    console.log('--- 5. ПРОВЕРКА СЕРВЕРА (server.js) ---');
    const srvCode = await get('/server.js');
    assert(srvCode && srvCode.s === 200, 'server.js → 200');
    
    // Функционал комнат
    assert(srvCode.b.includes("'create-room'"), 'Обработчик create-room');
    assert(srvCode.b.includes("'join-room'"), 'Обработчик join-room');
    assert(srvCode.b.includes("'leave-room'"), 'Обработчик leave-room');
    assert(srvCode.b.includes("'get-rooms'"), 'Обработчик get-rooms');
    assert(srvCode.b.includes("'auth-session'"), 'Обработчик auth-session');
    assert(srvCode.b.includes("internalJoin"), 'Функция internalJoin');
    assert(srvCode.b.includes("internalLeave"), 'Функция internalLeave');
    assert(srvCode.b.includes("createRoom("), 'Функция createRoom');
    assert(srvCode.b.includes("getRoomList("), 'Функция getRoomList');
    assert(srvCode.b.includes("checkServerWin("), 'Функция checkServerWin');
    assert(srvCode.b.includes("getRoleForSocket("), 'Функция getRoleForSocket');
    assert(srvCode.b.includes("addGameToHistory("), 'Функция addGameToHistory');
    assert(srvCode.b.includes("addChatToHistory("), 'Функция addChatToHistory');
    assert(srvCode.b.includes("tryStartGame("), 'Функция tryStartGame');

    // Пароль
    assert(srvCode.b.includes('password'), 'Поддержка пароля');
    assert(srvCode.b.includes('asViewer'), 'Поддержка выбора роли');

    // История
    assert(srvCode.b.includes('gameHistory'), 'История игр (gameHistory)');
    assert(srvCode.b.includes('chatHistory'), 'История чата (chatHistory)');
    assert(srvCode.b.includes('viewerTokens'), 'Список наблюдателей (viewerTokens)');

    // Рассылка
    assert(srvCode.b.includes("io.to("), 'io.to() для комнатных рассылок');
    assert(srvCode.b.includes("socket.to("), 'socket.to() для ходов');
    
    // Игровая логика
    assert(srvCode.b.includes("'player-move'"), 'Обработчик player-move');
    assert(srvCode.b.includes("'game-over-winner'"), 'Обработчик game-over-winner');
    assert(srvCode.b.includes("'restart-decision'"), 'Обработчик restart-decision');
    assert(srvCode.b.includes("'send-chat-message'"), 'Обработчик send-chat-message');
    assert(srvCode.b.includes("'disconnect'"), 'Обработчик disconnect');

    // Валидация
    assert(srvCode.b.includes("cellIndex < 0 || cellIndex > 8"), 'Валидация cellIndex');
    assert(srvCode.b.includes("sessionToken"), 'Использование sessionToken');
    console.log(`  OK\n`);

    // =====================================================================
    console.log('--- 6. ПРОВЕРКА КЛИЕНТА (script.js) ---');
    const cliCode = await get('/script.js');
    assert(cliCode && cliCode.s === 200, 'script.js → 200');

    // Комнаты
    assert(cliCode.b.includes("'create-room'"), 'Эмит create-room');
    assert(cliCode.b.includes("'join-room'"), 'Эмит join-room');
    assert(cliCode.b.includes("'leave-room'"), 'Эмит leave-room');
    assert(cliCode.b.includes("'get-rooms'"), 'Эмит get-rooms');
    assert(cliCode.b.includes("'room-list'"), 'Обработка room-list');
    assert(cliCode.b.includes("'room-joined'"), 'Обработка room-joined');
    assert(cliCode.b.includes("'room-error'"), 'Обработка room-error');
    assert(!cliCode.b.includes("'update-history'"), 'Нет обработки update-history (удалена)');
    assert(cliCode.b.includes("currentRoom"), 'Переменная currentRoom');
    
    // Пароль
    assert(cliCode.b.includes('password-modal'), 'Работа с модалкой пароля');
    assert(cliCode.b.includes('password-input'), 'Поле ввода пароля');

    // Выбор роли
    assert(cliCode.b.includes('role-modal'), 'Работа с модалкой роли');
    assert(cliCode.b.includes('asViewer'), 'Флаг asViewer');
    assert(cliCode.b.includes("'viewer'"), 'Роль viewer в script.js');
    assert(cliCode.b.includes('joinWithRole'), 'Функция joinWithRole (нет дублирования обработчиков)');
    assert( (cliCode.b.match(/addEventListener\('click'/g) || []).length >= 3, 'Минимум 3 addEventListener (правильно)');
    assert(!cliCode.b.includes("const origPlayer"), 'Нет мёртвого кода origPlayer');
    assert(!cliCode.b.includes("origPlayer"), 'Нет ссылок origPlayer');

    // ИИ
    assert(cliCode.b.includes('play-ai-btn'), 'Кнопка игры против ИИ');
    assert(!cliCode.b.includes('mode-toggle-inline'), 'Нет переключателя ИИ в шапке');
    assert(!cliCode.b.includes('modeToggleInline'), 'Нет ссылки modeToggleInline');
    assert(cliCode.b.includes('isAiMode'), 'Флаг isAiMode');
    assert(cliCode.b.includes('getBestMove'), 'Вызов getBestMove');

    // Чат
    assert(cliCode.b.includes("'send-chat-message'"), 'Эмит send-chat-message');
    assert(cliCode.b.includes("'broadcast-chat-message'"), 'Обработка broadcast-chat-message');
    assert(cliCode.b.includes('chatHistory'), 'Загрузка истории чата');
    assert(!cliCode.b.includes('chatMessagesMobile'), 'Нет mobile-чата (только один чат)');
    assert(!cliCode.b.includes('gameHistoryEl'), 'Нет gameHistoryEl (история убрана)');
    assert(!cliCode.b.includes('renderGameHistory'), 'Нет renderGameHistory');
    
    // События
    assert(cliCode.b.includes("'player-role'"), 'Обработка player-role');
    assert(cliCode.b.includes("'game-start'"), 'Обработка game-start');
    assert(cliCode.b.includes("'server-move'"), 'Обработка server-move');
    assert(cliCode.b.includes("'restore-board-state'"), 'Обработка restore-board-state');
    assert(cliCode.b.includes("'partner-wants-restart'"), 'Обработка partner-wants-restart');
    assert(cliCode.b.includes("'partner-returned'"), 'Обработка partner-returned');
    assert(cliCode.b.includes("'partner-disconnected-waiting'"), 'Обработка partner-disconnected-waiting');

    // Исправленные баги (из предыдущих версий)
    assert(cliCode.b.includes("myRole === currentPlayer"), 'Баг #1: draw использует myRole === currentPlayer');
    assert(cliCode.b.includes('.slice(2, 11)'), 'Баг #7: slice вместо substr');
    assert(!cliCode.b.includes('.substr('), 'Баг #7: substr не используется');
    
    // Защита наблюдателя (баг: viewer получал isMyTurn=true и мог кликать)
    assert(cliCode.b.includes("myRole === 'viewer'"), 'Защита наблюдателя в обработчиках');
    assert(cliCode.b.includes("'player-role'"), 'Обработчик player-role');
    assert(cliCode.b.includes("'server-move'"), 'Обработчик server-move');
    assert(cliCode.b.includes("'game-start'"), 'Обработчик game-start');
    assert(cliCode.b.includes("'restore-board-state'"), 'Обработчик restore-board-state');
    assert(cliCode.b.includes("'partner-disconnected-waiting'"), 'Обработчик partner-disconnected-waiting');
    assert(cliCode.b.includes("'partner-returned'"), 'Обработчик partner-returned');
    assert(cliCode.b.includes("'game-force-restart'"), 'Обработчик game-force-restart');
    assert(cliCode.b.includes("'partner-refused-restart'"), 'Обработчик partner-refused-restart');
    assert(cliCode.b.includes("'partner-wants-restart'"), 'Обработчик partner-wants-restart');
    console.log(`  OK\n`);

    // =====================================================================
    console.log('--- 7. ПРОВЕРКА SOCKET.IO ---');
    const io = await get('/socket.io/?EIO=4&transport=polling');
    assert(io && io.s === 200, 'Socket.IO handshake → 200');
    assert(io.b.includes('sid'), 'Socket.IO SID получен');
    assert(io.b.includes('websocket'), 'WebSocket upgrade доступен');
    assert(io.b.includes('pingInterval'), 'pingInterval установлен');
    assert(io.b.includes('pingTimeout'), 'pingTimeout установлен');
    console.log(`  OK\n`);

    // =====================================================================
    console.log('--- 8. ПРОВЕРКА БАГОВ (EDGE CASES) ---');
    
    // Проверка что нет утечки document.body.innerHTML
    assert(!cliCode.b.includes('document.body.innerHTML'), 'Нет document.body.innerHTML (баг #3 исправлен)');
    
    // Проверка once: true для рестарта
    assert(cliCode.b.includes('once: true'), 'once: true для обработчиков');
    
    // Проверка что нет chat-msg с хардкодом (XSS фикс)
    assert(!cliCode.b.includes("chat-msg-x'"), 'Нет хардкода chat-msg-x');
    assert(!cliCode.b.includes("chat-msg-o'"), 'Нет хардкода chat-msg-o');
    
    // Проверка textContent вместо innerHTML
    assert(cliCode.b.includes('.textContent'), 'Используется textContent');

    // Проверка серверной валидации
    assert(srvCode.b.includes("typeof cellIndex !== 'number'"), 'Сервер проверяет тип cellIndex');
    assert(srvCode.b.includes("cellIndex < 0"), 'Сервер проверяет нижнюю границу cellIndex');
    assert(srvCode.b.includes("cellIndex > 8"), 'Сервер проверяет верхнюю границу cellIndex');

    // Проверка gameStarted флага (нет дублирования game-start)
    assert(srvCode.b.includes('gameStarted'), 'Флаг gameStarted');

    // Проверка gameOver флага (нет двойного счёта)
    assert(srvCode.b.includes('gameOver'), 'Флаг gameOver');

    // Проверка viewer guards (myRole === 'viewer' во всех игровых обработчиках)
    const viewerGuardsEq = (cliCode.b.match(/myRole === 'viewer'/g) || []).length;
    const viewerGuardsNeq = (cliCode.b.match(/myRole !== 'viewer'/g) || []).length;
    assert(viewerGuardsEq + viewerGuardsNeq >= 12, `Viewer guards: ${viewerGuardsEq} === + ${viewerGuardsNeq} !== = ${viewerGuardsEq + viewerGuardsNeq} (ожидалось >= 12)`);
    console.log(`  OK\n`);

    // =====================================================================
    // ИТОГ
    console.log('==================================================');
    console.log(`ВСЕГО: ${passed} тестов пройдено`);
    console.log(`\x1b[31mБАГОВ НАЙДЕНО: ${failed}\x1b[0m`);
    if (failed > 0) {
        console.log('\nСписок ошибок:');
        errors.forEach(e => console.log(`  - ${e}`));
    }
    console.log('==================================================');

    srv.kill();
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('КРИТИЧЕСКАЯ ОШИБКА:', e); process.exit(1); });
