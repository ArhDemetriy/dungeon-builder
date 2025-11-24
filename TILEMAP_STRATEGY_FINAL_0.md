# Стратегия: Predictive Target State (Гибридная)

## Введение

Данная стратегия является синтезом трех подходов к управлению бесконечным тайлмапом. Она объединяет производительность **Spatial Culling** (отсечение по зонам), точность **Velocity Tracking** (отслеживание скорости) и надежность **Target State Pattern** (паттерн целевого состояния).

### Основные цели

1. **Нулевая нагрузка в покое**: Когда камера стоит или движется внутри безопасной зоны, нагрузка на CPU минимальна.
2. **Предиктивность**: Генерация слоя начинается _до_ того, как игрок увидит пустоту, за счет предсказания позиции.
3. **Асинхронная безопасность**: Полное отсутствие Race Conditions (гонок данных) между потоками движения и остановки.
4. **Плавность**: Четкое определение остановки (Idle) и отложенная центровка.

---

## Архитектура Решения

### 1. Компоненты системы

#### А. State Manager (Target State)

Вместо очередей и мьютексов используется принцип "Одной истины".

- **`currentLayerPos`**: Где слой находится физически прямо сейчас.
- **`targetLayerPos`**: Где слой _должен_ быть по мнению логики игры.
- **`isWorkerBusy`**: Флаг занятости асинхронного генератора.

Если `current !== target`, значит есть работа. Если во время работы `target` снова изменился — воркер просто пойдет на второй круг.

#### Б. Motion Tracker (EMA Velocity)

Используем экспоненциальное скользящее среднее для расчета скорости. Это фильтрует "шум" ввода и дает плавный вектор.

- `Velocity = OldVelocity * 0.7 + InstantVelocity * 0.3`

#### В. Predictive Boundary Check

Вместо проверки "где камера сейчас", мы проверяем "где камера будет через N мс".

- `PredictedPos = CameraPos + Velocity * LookaheadTime`
- Если `PredictedPos` выходит за границы безопасной зоны текущего слоя -> Обновляем `targetLayerPos`.

---

## Детальный Алгоритм

### Константы

```typescript
const CONFIG = {
    SAFE_MARGIN: 0.35,        // Отступ безопасной зоны (35% от края)
    VELOCITY_SMOOTH: 0.7,     // Коэффициент сглаживания скорости
    PREDICT_TIME: 300,        // Время предсказания (мс)
    IDLE_THRESHOLD: 0.05,     // Порог скорости для остановки (px/ms)
    CENTER_DEBOUNCE: 500,     // Задержка перед центровкой (мс)
};
```

### 1. Метод `update(time, delta)`

Вызывается каждый кадр.

```typescript
update(time, delta) {
    // 1. Обновляем физику камеры (Motion Tracker)
    this.updateVelocity(delta);

    // 2. Проверка на покой (Idle Check)
    if (this.getSpeed() < CONFIG.IDLE_THRESHOLD) {
        this.handleIdleState(delta);
        // Если мы в покое и в безопасной зоне -> быстрый выход
        if (this.isInSafeZone(this.camera.pos)) return;
    } else {
        this.resetIdleState();
    }

    // 3. Предиктивная проверка (Predictive Check)
    // Вычисляем, где камера будет через 300мс
    const predictedX = this.camera.x + (this.velocity.x * CONFIG.PREDICT_TIME);
    const predictedY = this.camera.y + (this.velocity.y * CONFIG.PREDICT_TIME);

    // 4. Проверка границ (Spatial Culling)
    // Если предсказанная точка всё еще в безопасной зоне -> ничего не делаем
    if (this.isInSafeZone({x: predictedX, y: predictedY})) {
        this.tryProcessWorker(); // Просто проверяем, не освободился ли воркер
        return;
    }

    // 5. Расчет новой цели (Target Calculation)
    // Если вышли за пределы - ставим цель сдвинуть слой так,
    // чтобы предсказанная точка оказалась в центре нового слоя.
    this.targetLayerPos = this.calculateIdealLayerPos(predictedX, predictedY);

    // 6. Запуск воркера
    this.tryProcessWorker();
}
```

### 2. Метод `tryProcessWorker()`

Асинхронный цикл обработки.

```typescript
async tryProcessWorker() {
    // Если уже работаем или цель достигнута -> выход
    if (this.isWorkerBusy) return;
    if (this.currentLayerPos.equals(this.targetLayerPos)) return;

    this.isWorkerBusy = true;

    // Фиксируем цель, к которой будем идти в этой итерации
    // (targetLayerPos может измениться пока мы работаем, это нормально)
    const jobTarget = { ...this.targetLayerPos };

    try {
        // Эмуляция тяжелой работы / Web Worker
        await this.generateLayer(jobTarget);

        // Применяем результат
        this.applyLayer(jobTarget);

        // Обновляем текущее состояние
        this.currentLayerPos = jobTarget;

        // Важно: Обновляем Safe Zone под новую позицию слоя
        this.updateSafeZone(jobTarget);

    } finally {
        this.isWorkerBusy = false;

        // Рекурсивная проверка: вдруг пока мы строили, камера уехала дальше?
        // Если да, следующая итерация запустится в следующем кадре update()
        // или можно вызвать рекурсивно здесь (с осторожностью).
    }
}
```

### 3. Логика Idle (Центровка)

Чтобы не дергать слой при каждой микро-остановке.

```typescript
handleIdleState(delta) {
    this.idleTimer += delta;

    // Если стоим долго -> ставим цель "Идеальный центр"
    if (this.idleTimer > CONFIG.CENTER_DEBOUNCE) {
        const idealPos = this.calculateIdealLayerPos(this.camera.x, this.camera.y);

        // Меняем цель только если она реально отличается (оптимизация)
        if (!idealPos.equals(this.targetLayerPos)) {
             this.targetLayerPos = idealPos;
             this.tryProcessWorker();
        }
    }
}
```

---

## План Реализации

### Шаг 1: Подготовка `TilemapController`

1. Добавить поля:
   - `velocity: {x, y}`
   - `safeZone: Rectangle`
   - `targetLayerPos` / `currentLayerPos`
   - `isWorkerBusy`
   - `idleTimer`
2. Добавить константы конфигурации (можно в `src/game/constants.ts` или в класс).

### Шаг 2: Реализация методов

1. **`updateVelocity(delta)`**: Расчет EMA скорости.
2. **`isInSafeZone(point)`**: Проверка `Rectangle.contains`.
3. **`calculateIdealLayerPos(x, y)`**: Округление координат до сетки чанков/тайлов.
4. **`update(time, delta)`**: Основной "мозг" (см. выше).
5. **`tryProcessWorker()`**: Асинхронная обвязка.

### Шаг 3: Интеграция

1. В `MainScene.ts` удалить все таймеры (`tilemapStreamingTimer`).
2. В `MainScene.update()` добавить единственный вызов: `this.tilemapController.update(time, delta)`.

---

## Сравнение с предыдущими версиями

- **Отличие от V1 (Таймер)**: Мы реагируем мгновенно на выход из зоны (через предсказание), а не ждем тика таймера.
- **Отличие от V2 (Вектор + Очередь)**: Мы убрали сложную очередь. Если игрок метнулся влево, а потом резко вверх — `targetLayerPos` просто перезапишется с "Left" на "Top". Воркер, закончив "Left", увидит "Top" и сразу пойдет строить его. Система самокорректируется.
- **Отличие от V3 (Priorities)**: Нам не нужны приоритеты. Движение всегда важнее простоя, так как `update` каждый кадр пересчитывает цель движения. Если мы движемся, `idleTimer` сбрасывается, и центровка отменяется сама собой.

Эта стратегия является **Robust (Надежной)** и **Self-Healing (Самовосстанавливающейся)**.
