import type { BaseNode, TemplateLiteral } from 'estree';
import type { ENDContent } from './ast';
import { isContentExpression } from './utils';

export interface ScannerPtr {
    index: number;
    pos: number;
}

export type MatchFunction = (ch: number) => boolean;

/**
 * Сканнер для шаблона: использует TemplateLiteral в качестве источника данных
 */
export default class Scanner {
    public ptr: ScannerPtr = { index: 0, pos: 0 };
    public start: ScannerPtr = { index: 0, pos: 0 };

    constructor(private template: TemplateLiteral) {}

    private get pos(): number {
        return this.ptr.pos;
    }

    private set pos(value: number) {
        this.ptr.pos = Math.max(0, value);
    }

    private get node() {
        return this.getNode(this.ptr);
    }

    /**
     * Возвращает код текущего символа парсера без смещения указателя
     */
    peek(offset = 0): number {
        const { node, pos } = this;
        return node?.value.raw.charCodeAt(pos + offset) ?? NaN;
    }

    /**
     * Возвращает *code point* текущего символа парсера и смещает указатель
     */
    next(): number {
        return this.hasNext() ? this.inc(this.peek()) : NaN;
    }

    /**
     * Вернёт `true` если находимся в конце потока
     */
    eof(): boolean {
        const { node, pos } = this;
        return node ? node.tail && pos >= node.value.raw.length  : true;
    }

    /**
     * Backs up the stream n characters. Backing it up further than the
     * start of the current token will cause things to break, so be careful.
     */
    backUp(n = 1): void {
        this.pos -= n;
    }

    getPtr() {
        return { ...this.ptr };
    }

    /**
     * Get the string between the start of the current token and the
     * current stream position.
     */
    current(): string {
        const start = this.getNode(this.start)!;
        const end = this.getNode(this.ptr)!;
        if (start === end) {
            return start.value.raw.substring(this.start.pos, this.ptr.pos);
        }

        let text = start.value.raw.slice(this.start.pos);
        for (let i = this.start.index + 1; i < this.ptr.index; i++) {
            text += this.getNode(i)!.value.raw;
        }
        text += end.value.raw.slice(0, this.ptr.pos);

        return text;
    }

    /**
     * Вернёт `true` если позиция парсера не находится в конце текущего квази-элемента
     * и можно ещё с него считывать данные
     */
    hasNext(): boolean {
        const { node, pos } = this;
        return node ? pos < node.value.raw.length : false;
    }

    /**
     * Если находимся в конце текущего квази-элемент — возвращаем выражение следующее
     * за ним и переходим на следующий квази-элемент
     */
    expression(): ENDContent | undefined {
        if (!this.hasNext()) {
            const expr = this.template.expressions[this.ptr.index];
            if (expr) {
                if (!isContentExpression(expr)) {
                    throw this.error(`Unexpected expression type: ${expr.type}`, expr);
                }
                this.ptr.index++;
                this.ptr.pos = 0;
                this.start = { ...this.ptr };
                return expr;
            }
        }
    }

    /**
     * `match` can be a character code or a function that takes a character code
     * and returns a boolean. If the next character in the stream 'matches'
     * the given argument, it is consumed and returned.
     * Otherwise, `false` is returned.
     */
    eat(match: number | MatchFunction): boolean {
        const ch = this.peek();
        const ok = typeof match === 'function' ? match(ch) : ch === match;

        if (ok) {
            this.next();
        }

        return ok;
    }

    /**
     * Repeatedly calls `eat` with the given argument, until it fails.
     * Returns `true` if any characters were eaten.
     */
    eatWhile(match: number | MatchFunction): boolean {
        const start = this.pos;
        while (!this.eof() && this.eat(match)) {
            // empty
        }
        return this.ptr.pos !== start;
    }

    /**
     * Eats array of character codes from given stream
     * @param codes Array of character codes to consume
     */
    eatArray(codes: number[]): boolean {
        const start = this.ptr;

        for (let i = 0; i < codes.length; i++) {
            if (!this.eat(codes[i])) {
                this.ptr = start;
                return false;
            }
        }

        this.start = start;
        return true;
    }

    /**
     * Creates source location from current state or arguments
     */
    loc(start = this.start, end = this.ptr): { start: number, end: number } {
        return {
            start: this.sourceLocation(start),
            end: this.sourceLocation(end),
        };
    }

    /**
     * Returns source location for given character position in current text stream
     */
    sourceLocation(ptr = this.ptr): number {
        const node = this.getNode(ptr);
        return node ? node.start + ptr.pos : -1;
    }

    /**
     * Creates error object with current stream state
     */
    error(message: string, source?: BaseNode | ScannerPtr | null): ENDSyntaxError {
        let pos: number | undefined;
        if (source) {
            pos = 'type' in source ? source.start : this.sourceLocation(source);
        }

        return new ENDSyntaxError(message, pos);
    }

    /**
     * Смещает указатель на размер указанного кода символ вправо.
     */
    private inc(code: number): number {
        this.ptr.pos++;
        return code;
    }

    private getNode(ptr: ScannerPtr | number = this.ptr) {
        const index = typeof ptr === 'number' ? ptr : ptr.index;
        return this.template.quasis[index];
    }
}

export class ENDSyntaxError extends SyntaxError {
    public pos?: number;

    constructor(message: string, source?: BaseNode | number) {
        let pos: number | undefined;
        if (source != null) {
            pos = typeof source === 'object' && 'type' in source ? source.start : source;
        }

        if (pos != null) {
            message += ` at character ${pos}`;
        }

        super(message);
        if (pos != null) {
            this.pos = pos
        }
    }
}
