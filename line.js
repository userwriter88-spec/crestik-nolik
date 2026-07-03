const strikeStyles = {
    // Горизонтали (плавно рисуются СЛЕВА НАПРАВО)
    'horizontal-1': { width: '90%', height: '6px', transform: 'translateY(-108px) rotate(0deg)' }, 
    'horizontal-2': { width: '90%', height: '6px', transform: 'rotate(0deg)' },                  
    'horizontal-3': { width: '90%', height: '6px', transform: 'translateY(108px) rotate(0deg)' },  
    
    // Вертикали (сверху вниз)
    'vertical-1': { width: '90%', height: '6px', transform: 'translateX(-36%) rotate(90deg)' }, 
    'vertical-2': { width: '90%', height: '6px', transform: 'rotate(90deg)' },                  
    'vertical-3': { width: '90%', height: '6px', transform: 'translateX(36%) rotate(90deg)' },  
    
    // Диагональ главная (от нижнего левого к верхнему правому)
    'main-diagonal': { width: '130%', height: '6px', transform: 'rotate(45deg) scaleY(-1)' },               
    
    // Диагональ побочная (строго от верхнего правого к нижнему левому)
    'side-diagonal': { width: '130%', height: '6px', transform: 'rotate(135deg)' }               
};

function drawStrikeLine(lineType) {
    const strikeLine = document.getElementById('strike-line');
    const styles = strikeStyles[lineType];
    
    // Безопасный выход, если стиль не найден
    if (!styles) return;
    
    // Сбрасываем старые инлайн-стили
    strikeLine.removeAttribute('style');
    
    // Текстовая маскировка минусов, защищенная от багов платформы
    const m = '-50%';
    const baseCentering = 'translate(' + m + ', ' + m + ') ';
    
    // Применяем размеры и полную матрицу трансформации
    strikeLine.style.width = styles.width;
    strikeLine.style.height = styles.height;
    strikeLine.style.transform = baseCentering + styles.transform;
    
    // Включаем отображение (активирует плавную анимацию clip-path из style.css)
    strikeLine.style.display = 'block';
}
