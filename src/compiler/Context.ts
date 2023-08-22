import { parse } from 'acorn';
import type * as ESTree from 'estree';
import { traverse } from 'estraverse';
import EndorphinContext from './EndorphinContext';
import Scope from './Scope';
import Patcher from './Patcher';

type Pos = [start: number, end: number];
type PosSource = number | Pos | ESTree.Node;

/**
 * Контекст компиляции исходного JS-модуля
 */
export default class Context {
    public ast: ESTree.Program;
    public endorphin: EndorphinContext;
    public scope: Scope;
    public patcher: Patcher;

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
        console.warn(message);
    }

    /**
     * Выбрасывает исключение
     */
    error(message: string, pos?: PosSource) {
        throw new Error(message);
    }
}
