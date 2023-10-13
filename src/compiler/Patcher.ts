interface Patch {
    start: number;
    end: number;
    value: string;
    side: -1 | 0 | 1;
}

type PatcherRange = [start: number, end: number] | { start: number, end: number };

export default class Patcher {
    private patches: Patch[] = [];
    private start = 0;
    private end: number;

    constructor(public code: string, limit?: number | PatcherRange) {
        this.end = code.length;
        if (typeof limit === 'number') {
            this.start = limit;
        } else if (limit) {
            this.start = getStart(limit);
            this.end = getEnd(limit);
        }
    }

    /**
     * Добавляет `value` в указанную позицию. Если в ней уже были изменения,
     * добавит их в конце существующих изменений
     */
    append(pos: number, value: string) {
        this.push(pos, pos, value, 1);
    }

    /**
     * Добавляет `value` в указанную позицию. Если в ней уже были изменения,
     * добавит их в начале существующих изменений
     */
    prepend(pos: number, value: string, indent?: boolean) {
        if (indent) {
            value += this.indent(pos);
        }

        this.push(pos, pos, value, -1);
    }

    /**
     * Заворачивает значение указанного узла
     */
    wrap(range: PatcherRange, before: string, after: string) {
        this.prepend(getStart(range), before);
        this.append(getEnd(range), after);
    }

    /**
     * Заменяет содержимое указанного узла на новое
     */
    replace(range: PatcherRange, value: string) {
        this.push(getStart(range), getEnd(range), value);
    }

    /**
     * Добавляет патч с указанными параметрами
     */
    push(start: number, end: number, value = '', side: 0 | -1 | 1 = 0) {
        this.patches.push({ start, end, value, side });
    }

    /**
     * Применяет патчи к текущему исходному коду и возвращает отрисованный результат
     */
    render() {
        const lookup = new Map<Patch, number>();
        const { start, end, code } = this;

        const patches = this.patches.filter(p => p.start >= start && p.end <= end);
        patches.forEach((patch, i) => lookup.set(patch, i));
        patches.sort((a, b) => {
            const diff = a.start - b.start || a.side - b.side;
            if (diff) {
                return diff;
            }

            // В зависимости от того, с какой стороны добавлен патч,
            // нужно использовать разную логику сортировки по индексу:
            // патчи добавленные слева от точки должны идти от меньшего
            // к большему (в порядке добавления), справа — от большего к меньшему
            // (обратный порядок)
            const aIx = lookup.get(a)!;
            const bIx = lookup.get(b)!;
            return a.side === -1 ? aIx - bIx : bIx - aIx;
        });
        let offset = start;
        let result = '';

        for (const patch of patches) {
            result += code.slice(offset, patch.start) + patch.value;
            offset = patch.end;
        }

        return result + code.slice(offset, end);
    }

    /**
     * Возвращает подстроку для указанного узла
     */
    substr(range: PatcherRange): string {
        return this.code.slice(getStart(range), getEnd(range));
    }

    /**
     * Возвращает строку-отступ для указанной позиции
     */
    indent(pos: number): string {
        const { code } = this;
        const end = pos;
        const reSpace = /\s/;
        while (pos > 0 && reSpace.test(code[pos - 1])) {
            pos--;
            if (code[pos] === '\r' && code[pos - 1] === '\n') {
                pos--;
            }
            if (code[pos] === '\n') {
                break;
            }
        }

        return code.slice(pos, end);
    }
}

function getStart(range: PatcherRange): number {
    return Array.isArray(range) ? range[0] : range.start;
}

function getEnd(range: PatcherRange): number {
    return Array.isArray(range) ? range[1] : range.end;
}