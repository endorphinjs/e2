import type * as ESTree from 'estree';
import { replace } from 'estraverse';

export type NodeMapping = Map<ESTree.Node, ESTree.Node>;

interface Patch {
    start: number;
    end: number;
    value: string;
    side: -1 | 0 | 1;
}

export default class Patcher {
    private patches: Patch[] = [];

    constructor(public code: string, public ast: ESTree.Node) {}

    /**
     * Добавляет `value` в указанную позицию. Если в ней уже были изменения,
     * добавит их в конце существующих изменений
     */
    append(pos: number, value: string) {
        this.patches.push({
            start: pos,
            end: pos,
            value,
            side: 1,
        });
    }

    /**
     * Добавляет `value` в указанную позицию. Если в ней уже были изменения,
     * добавит их в начале существующих изменений
     */
    prepend(pos: number, value: string, indent?: boolean) {
        if (indent) {
            value += this.indent(pos);
        }

        this.patches.push({
            start: pos,
            end: pos,
            value,
            side: -1,
        });
    }

    /**
     * Заворачивает значение указанного узла
     */
    wrap(node: ESTree.Node, before: string, after: string) {
        this.prepend(node.start, before);
        this.append(node.end, after);
    }

    /**
     * Заменяет содержимое указанного узла на новое
     */
    replace(node: ESTree.Node, value: string) {
        this.patches.push({
            start: node.start,
            end: node.end,
            value,
            side: 0
        });
    }

    /**
     * Применяет патчи к текущему исходному коду и возвращает отрисованный результат
     */
    render() {
        const lookup = new Map<Patch, number>();
        this.patches.forEach((patch, i) => lookup.set(patch, i));
        const patches = this.patches.slice().sort((a, b) => {
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
        let offset = 0;
        let result = '';
        const { code } = this;

        for (const patch of patches) {
            result += code.slice(offset, patch.start) + patch.value;
            offset = patch.end;
        }

        return result + code.slice(offset);
    }

    /**
     * Создаёт новый инстанс патчера в контексте указанного узла. Новый патчер
     * будет содержать только фрагмент кода, который соответствует узлу `node`
     * и его содержимому. Также будет создана глубока копия узла `node`
     * с правильными позициями в коде
     * @param map Если указан, в него запишется маппинг старых узлов на новые
     */
    slice(node: ESTree.Node, map?: NodeMapping): Patcher {
        return patcherFromNode(this.code, node, map);
    }

    /**
     * Возвращает подстроку для указанного узла
     */
    substr(node: ESTree.Node): string {
        return this.code.slice(node.start, node.end);
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

/**
 * Создаёт инстанс патчера в контексте указанного узла. Новый патчер
 * будет содержать только фрагмент кода, который соответствует узлу `node`
 * и его содержимому. Также будет создана глубока копия узла `node`
 * с правильными позициями в коде
 * @param map Если указан, в него запишется маппинг старых узлов на новые
 */
export function patcherFromNode(code: string, node: ESTree.Node, map?: NodeMapping): Patcher {
    const offset = node.start;
    const replaced = replace(node, {
        enter(n) {
            const copy = cloneNode(n);
            copy.start -= offset;
            copy.end -= offset;
            map?.set(n, copy);
            return copy;
        }
    });

    return new Patcher(code.slice(node.start, node.end), replaced);
}

/**
 * Делает неглубокий клон указанного узла: клонируется сам узел, но не дочерние
 * узлы
 */
function cloneNode<T extends ESTree.Node>(node: T): T {
    node = {...node};
    for (const key of (Object.keys(node) as Array<keyof T>)) {
        let value = node[key];
        if (Array.isArray(value)) {
            // @ts-ignore Copy array value
            node[key] = [...value];
        } else if (value != null && typeof value === 'object') {
            node[key] = { ...value };
        }
    }

    return node;
}