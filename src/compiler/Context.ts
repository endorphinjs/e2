import { parse } from 'acorn';
import type * as ESTree from 'estree';
import { traverse } from 'estraverse';
import EndorphinContext from './EndorphinContext';
import Scope from './Scope';
import Patcher from './Patcher';

type Pos = [start: number, end: number];
type PosSource = number | Pos | ESTree.Node;

/** Приватные функции модуля */
export type InternalSymbols = 'createContext' | 'setupContext' | 'finalizeContext' | 'getComputed'
    | 'attach'
    | 'element' | 'text' | 'attribute';

/** Путь к модулю с приватным функциями */
const internalModule = 'endorphin/internal';

/**
 * Контекст компиляции исходного JS-модуля
 */
export default class Context {
    public ast: ESTree.Program;
    public endorphin: EndorphinContext;
    public scope: Scope;
    public patcher: Patcher;

    private usedInternals = new Map<InternalSymbols, string>();
    /** Дополнительные чанки для шаблона */
    private chunks: string[] = [];

    /**
     * @param code Исходный код JS-модуля
     */
    constructor(public code: string) {
        this.ast = parse(code, { ecmaVersion: 'latest', sourceType: 'module' }) as ESTree.Program;
        this.endorphin = new EndorphinContext(this.ast);
        // TODO собрать символы скоупа из модуля
        this.scope = new Scope();
        this.patcher = new Patcher(code, this.ast);
    }

    /**
     * Возвращает список объявлений компонентов внутри модуля
     */
    getComponents(): ESTree.Function[] {
        const result: ESTree.Function[] = [];
        const { endorphin } = this;

        traverse(this.ast, {
            enter(node) {
                if (endorphin.isComponentFactory(node)) {
                    result.push(node);
                    this.skip();
                } else if (endorphin.isExplicitComponentDeclaration(node)) {
                    result.push(node.arguments[0] as ESTree.Function);
                    this.skip();
                }
            }
        });

        return result;
    }

    /**
     * Выполняет компиляцию объявления компонента
     */
    compile() {

    }

    /**
     * Печатает Warning при парсинге или компиляции шаблона
     */
    warn(message: string, pos?: PosSource) {
        console.warn(message + posSuffix(pos));
    }

    /**
     * Выбрасывает исключение
     */
    error(message: string, pos?: PosSource) {
        throw new Error(message = posSuffix(pos));
    }

    /**
     * Возвращает обновлённый код модуля с скомпилированными модулями и шаблонами
     */
    render() {
        let prefix = '';
        if (this.usedInternals.size) {
            const imports: string[] = [];
            this.usedInternals.forEach((value, key) => {
                imports.push(key === value ? key : `${key} as ${value}`);
            });

            prefix += `import { ${imports.join(', ')} } from '${internalModule}';\n`;
        }

        return prefix + this.patcher.render() + this.chunks.map(chunk => '\n\n' + chunk);
    }

    /**
     * Добавляет фрагмент кода для вывода в конце модуля
     */
    push(chunk: string) {
        this.chunks.push(chunk);
    }

    /**
     * Возвращает указатель на внутренний метод из приватного модуля рантайма.
     * Также помечает этот метод как используемый
     */
    useInternal(symbol: InternalSymbols): string {
        if (!this.usedInternals.has(symbol)) {
            this.usedInternals.set(symbol, this.scope.id(symbol));
        }

        return this.usedInternals.get(symbol)!;
    }
}

function posSuffix(pos?: PosSource): string {
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
