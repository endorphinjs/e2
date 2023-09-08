import { Computer } from '../types';

/** Глобальное хранилище computed-значений */
export const computedValues = new Map<Computer, any>();

export function getComputed<T = any>(computer: Computer<T>): T {
    if (computedValues.has(computer)) {
        return computedValues.get(computer);
    }

    const value = computer();
    computedValues.set(computer, value);
    return value;
}