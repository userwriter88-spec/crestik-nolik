// Вспомогательная функция для проверки конкретной тройки ячеек
function checkAiLine(gameState, a, b, c, targetSign) {
    const vals = [gameState[a], gameState[b], gameState[c]];
    if (vals.filter(v => v === targetSign).length === 2 && vals.includes("")) {
        if (gameState[a] === "") return a;
        if (gameState[b] === "") return b;
        return c;
    }
    return null;
}

function getBestMove(gameState) {
    // 1. АТАКА: Пытаемся победить прямо сейчас (ищем две 'O' и пустую клетку)
    let res = null;
    
    // Проверяем горизонтали
    res = checkAiLine(gameState, 0, 1, 2, 'O'); if (res !== null) return res;
    res = checkAiLine(gameState, 3, 4, 5, 'O'); if (res !== null) return res;
    res = checkAiLine(gameState, 6, 7, 8, 'O'); if (res !== null) return res;
    // Проверяем вертикали
    res = checkAiLine(gameState, 0, 3, 6, 'O'); if (res !== null) return res;
    res = checkAiLine(gameState, 1, 4, 7, 'O'); if (res !== null) return res;
    res = checkAiLine(gameState, 2, 5, 8, 'O'); if (res !== null) return res;
    // Проверяем диагонали
    res = checkAiLine(gameState, 0, 4, 8, 'O'); if (res !== null) return res;
    res = checkAiLine(gameState, 2, 4, 6, 'O'); if (res !== null) return res;


    // 2. ОБОРОНА: Блокируем игрока (ищем два 'X' и пустую клетку)
    // Проверяем горизонтали
    res = checkAiLine(gameState, 0, 1, 2, 'X'); if (res !== null) return res;
    res = checkAiLine(gameState, 3, 4, 5, 'X'); if (res !== null) return res;
    res = checkAiLine(gameState, 6, 7, 8, 'X'); if (res !== null) return res;
    // Проверяем вертикали
    res = checkAiLine(gameState, 0, 3, 6, 'X'); if (res !== null) return res;
    res = checkAiLine(gameState, 1, 4, 7, 'X'); if (res !== null) return res;
    res = checkAiLine(gameState, 2, 5, 8, 'X'); if (res !== null) return res;
    // Проверяем диагонали
    res = checkAiLine(gameState, 0, 4, 8, 'X'); if (res !== null) return res;
    res = checkAiLine(gameState, 2, 4, 6, 'X'); if (res !== null) return res;


    // 3. СТРАТЕГИЯ: Если центр свободен, бот всегда занимает его
    if (gameState[4] === "") {
        return 4;
    }


    // 4. СЛУЧАЙНОСТЬ: Если умных ходов нет, берем любую пустую ячейку
    const emptyCells = [];
    gameState.forEach((val, idx) => { if (val === "") emptyCells.push(idx); });
    
    if (emptyCells.length > 0) {
        const randomIndex = Math.floor(Math.random() * emptyCells.length);
        return emptyCells[randomIndex];
    }
    
    return null;
}
