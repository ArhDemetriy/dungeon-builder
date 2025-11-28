/**
 * Типы для системы стриминга тайлмапа.
 *
 * ВЗАИМОДЕЙСТВИЕ:
 * - Direction/DirectionVector → используются в predictLayerNeed() и updateTargetPosition()
 * - VelocityState → состояние velocity tracking
 *
 * Тип операции вычисляется из DirectionVector: нулевой вектор = center, ненулевой = movement.
 */

/** Направление смещения слоя: -1 (влево/вверх), 0 (нет), 1 (вправо/вниз) */
export type Direction = -1 | 0 | 1;
/** Двумерный вектор направления — immutable. {x:0,y:0} = center, иначе = movement */
export type DirectionVector = { x: Direction; y: Direction };
export function isZeroVector(vector: DirectionVector): vector is { x: 0; y: 0 } {
  return !(vector.x || vector.y);
}

/**
 * Состояние velocity tracking.
 *
 * ЗАЧЕМ:
 * - velocity — текущая скорость с EMA сглаживанием
 * - speed — модуль velocity (вычисляется в updateVelocityAndAcceleration)
 * - acceleration — для квадратичной экстраполяции
 * - lastPosition/lastUpdateTime — для вычисления мгновенной скорости
 */
export type VelocityState = {
  velocity: { x: number; y: number };
  speed: number;
  acceleration: { x: number; y: number };
  lastPosition: { x: number; y: number };
  lastUpdateTime: number;
};
