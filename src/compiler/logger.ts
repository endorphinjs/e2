import { Node } from 'estree';
export type Pos = [start: number, end: number];
export type PosSource = number | Pos | Node;

export interface ILogger {
    /**
     * Печатает обычный лог
     */
    log(message: string, pos?: PosSource): void;

    /**
     * Печатает Warning при парсинге или компиляции шаблона
     */
    warn(message: string, pos?: PosSource): void;

    /**
     * Выбрасывает исключение
     */
    error(message: string, pos ?: PosSource): void;
}

export class Logger implements ILogger {
    log(message: string, pos?: PosSource) {
        console.log(message + posSuffix(pos));
    }

    warn(message: string, pos?: PosSource) {
        console.warn(message + posSuffix(pos));
    }

    error(message: string, pos?: PosSource) {
        throw new Error(message = posSuffix(pos));
    }
}

const defaultLogger = new Logger();
let logger = defaultLogger;

export default logger;

export function setLogger(value: ILogger) {
    logger = value;
}

export function releaseLogger() {
    logger = defaultLogger;
}

export function posSuffix(pos?: PosSource): string {
    if (pos != null) {
        if (typeof pos === 'number') {
            return ` at ${pos}`;
        }

        if (Array.isArray(pos)) {
            return ` at ${pos[0]}:${pos[1]}`;
        }
        return ` at ${pos.start}:${pos.end}`;
    }

    return '';
}
