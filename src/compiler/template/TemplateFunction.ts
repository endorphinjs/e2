import type * as ESTree from 'estree';
import { traverse } from 'estraverse';
import Scope from '../Scope';
import Patcher from '../Patcher';
import type ComponentDeclaration from '../ComponentDeclaration';
import type Context from '../Context';
import type { Chunk, TemplateArgument, TemplateFunctionArg, TemplateSymbol, TemplateVariable } from './types';
import { argument, isTemplateChunk, isTemplateSymbol, raw, t, variable } from './utils';

interface ExpressionWithMask {
    code: string;
    mask: number;
    maskSymbols: string[];
}

interface RenderScope {
    ctx: Context;
    refs?: TemplateArgument;
}

export const ctxArg = Symbol('ctx');
export const stageArg = Symbol('stage');
export const refsArgs = Symbol('refs');

const knownArgs = {
    [ctxArg]: 'ctx',
    [stageArg]: 'stage',
    [refsArgs]: 'refs'
} as const;

export default class TemplateFunction {
    private refsIndex = 0;
    private symbols = new Map<string, TemplateSymbol>();
    private scope = new Scope();
    private args = new Map<TemplateFunctionArg, TemplateArgument>();
    private beforeChunks: Chunk[] = [];
    private afterChunks: Chunk[] = [];
    private mountChunks: Chunk[] = [];
    private updateChunks: Chunk[] = [];
    private unmountChunks: Chunk[] = [];
    private _scopeSymbol: TemplateVariable;
    private _dirtySymbol: TemplateVariable;
    private scopeUsed = false;
    private dirtyUsed = false;

    /**
     * @param component Компонент, в контексте которого создаётся функция
     * @param name Название функции
     * @param args Аргументы для функции
     */
    constructor(public component: ComponentDeclaration, public name: string, args: TemplateFunctionArg[]) {
        // Сразу займём символы `scope` и `dirty` для удобства
        this._scopeSymbol = variable(this.scope.id('scope'));
        this._dirtySymbol = variable(this.scope.id('dirty'));

        for (const arg of args) {
            const id = this.scope.id(arg in knownArgs ? knownArgs[arg as keyof typeof knownArgs] : arg as string);
            this.args.set(arg, argument(id));
        }
    }

    get scopeSymbol() {
        this.scopeUsed = true;
        return this._scopeSymbol;
    }

    get dirtySymbol() {
        this.dirtyUsed = true;
        return this._dirtySymbol;
    }

    /**
     * Возвращает указатель на аргумент функции, который был передан в конструкторе
     */
    argument(arg: TemplateFunctionArg): TemplateArgument {
        const value = this.args.get(arg);
        if (!value) {
            throw new Error(`Unknown argument ${String(arg)}`);
        }
        return value;
    }

    /**
     * Создаёт уникальный идентификатор, который можно использовать в качестве
     * названия переменной внутри текущей функции
     */
    id(name: string): TemplateVariable {
        const symbol = variable(this.scope.id(name));
        this.symbols.set(symbol.id, symbol);
        return symbol;
    }

    /**
     * Создаёт уникальный идентификатор переменной, который будет сохранён между
     * вызовами функции (получить свой слот внутри аргумента `refsArgs`)
     */
    ref(name: string) {
        const symbol = variable(this.scope.id(name), this.refsIndex);
        this.symbols.set(symbol.id, symbol);
        this.refsIndex++;
        return symbol;
    }

    /**
     * Возвращает выражение, переписанное таким образом, чтобы переменные,
     * объявленные в фабрике компонента, доставались из скоупа
     */
    expression(expr: ESTree.Node, symbol: (index: number, node: ESTree.Node, isComputed?: boolean) => string): string {
        const { component } = this;
        const { code } = component.ctx;
        const { scope } = component;
        const patcher = new Patcher(code, expr);

        if (expr.type === 'Literal') {
            return JSON.stringify(expr.value);
        }

        traverse(expr, {
            enter(node) {
                const index = component.getScopeSlot(node);
                if (index != null) {
                    const isComputed = node.type === 'Identifier'
                        ? scope.computed.has(node.name)
                        : false;
                    patcher.replace(getIdentifierForScope(node), symbol(index, node, isComputed));
                }
            }
        });

        return patcher.render();
    }

    /**
     * Компилирует указанное выражение в контексте указанного скоупа и возвращает
     * в том числе маску для обновления
     */
    expressionWithMask(node: ESTree.Node): ExpressionWithMask {
        // TODO обработать переполнение маски для index > 31
        const { ctx } = this.component;
        let mask = 0;
        const maskSymbols: string[] = [];
        const code = this.expression(node, (index, n, isComputed) => {
            mask |= 1 << index;
            maskSymbols.push(n.type === 'Identifier' ? n.name : `${index}?`);
            let result = `${this.scopeSymbol.id}[${index}]`;
            if (isComputed) {
                result = `${ctx.useInternal('getComputed')}(${result})`;
            }
            return result;
        });

        return { mask, maskSymbols, code };
    }

    /**
     * Вернёт код с проверкой на необходимость выполнять его (dirty check)
     */
    dirtyCheck(exprData: ExpressionWithMask, code: Chunk): Chunk {
        // XXX маска не используется, если символ объявлен за пределами
        // компонента. Надо ли это учитывать?
        return exprData.mask
            ? t`(${this.dirtySymbol} & ${exprData.mask} /* ${raw(exprData.maskSymbols.join(' | '))} */) && ${code}`
            : code;
    }

    before(chunk: Chunk) {
        this.beforeChunks.push(chunk);
    }

    after(chunk: Chunk) {
        this.beforeChunks.push(chunk);
    }

    mount(chunk: Chunk) {
        this.mountChunks.push(chunk);
    }

    update(chunk: Chunk) {
        this.updateChunks.push(chunk);
    }

    unmount(chunk: Chunk) {
        this.unmountChunks.push(chunk);
    }

    render(): string {
        const indentChar = ' '.repeat(4);
        const indent = `\n${indentChar}`;
        const indent2 = indent + indentChar;
        const refs = this.args.get(refsArgs);
        const stage = this.args.get(stageArg);
        const { ctx } = this.component;
        const scope: RenderScope = { ctx, refs };

        const args: string[] = [];
        for (const arg of this.args.values()) {
            args.push(arg.id);
        }

        let result = `function ${this.name}(${args.join(', ')}) {`;

        if (this.scopeUsed || this.dirtyUsed) {
            const vars: string[] = [];
            if (this.scopeUsed) {
                vars.push(this._scopeSymbol.id);
            }

            if (this.dirtyUsed) {
                vars.push(this._dirtySymbol.id);
            }

            result += `${indent}const { ${vars.join(', ')} } = ${this.argument(ctxArg).id};`;
        }

        for (const chunk of this.beforeChunks) {
            result += `${indent}${renderChunk(chunk, scope)}`;
        }

        if (stage && refs) {
            const stageChunks: string[] = [];
            if (this.mountChunks.length) {
                const declared = getDeclaredVars(this.mountChunks);
                let declareCode = '';
                if (declared.size) {
                    declareCode = `let ${Array.from(declared).join(', ')};${indent2}`;
                }

                stageChunks.push(`if (${stage.id} === 1) {${indent2}`
                    + declareCode
                    + `${refs.id}.length = ${this.refsIndex};${indent2}`
                    + this.mountChunks.map(c => renderChunk(c, scope)).join(indent2)
                    + `${indent}}`
                );
            }

            if (this.updateChunks.length) {
                stageChunks.push(`if (${stage.id} === 2) {${indent2}`
                    + this.updateChunks.map(c => renderChunk(c, scope)).join(indent2)
                    + `${indent}}`
                );
            }

            if (this.unmountChunks.length) {
                stageChunks.push(`if (${stage.id} === 3) {${indent2}`
                    + this.unmountChunks.map(c => renderChunk(c, scope)).join(indent2)
                    + `${indent}}`
                );
            }

            if (stageChunks.length) {
                result += indent + stageChunks.join(' else ');
            }
        }

        for (const chunk of this.afterChunks) {
            result += `${indent}${renderChunk(chunk, scope)}`;
        }

        result += '\n}\n';
        return result;
    }
}

function renderChunk(chunk: Chunk, scope: RenderScope): string {
    if (typeof chunk === 'string') {
        return chunk;
    }

    const { ctx, refs } = scope;
    return chunk.value.map(c => {
        if (typeof c === 'string') {
            return c;
        }

        if (isTemplateChunk(c)) {
            return renderChunk(c, scope);
        }

        if (isTemplateSymbol(c)) {
            switch (c.type) {
                case 'variable':
                    return refs && c.index !== -1 ? `${refs.id}[${c.index}]` : c.id;
                case 'argument':
                    return c.id;
                case 'raw':
                    return c.value;
                case 'internal':
                    return ctx.useInternal(c.value);
            }
        }

        console.warn(`Unknown chunk type: ${chunk}`);
        return '';
    }).join('');
}

/**
 * Возвращает узел, который нужно заменить в коде на скоуп
 */
function getIdentifierForScope(node: ESTree.Node): ESTree.Node {
    switch (node.type) {
        case 'Identifier':
            return node;

        case 'AssignmentExpression':
            return getIdentifierForScope(node.left);

        case 'UpdateExpression':
        case 'UnaryExpression':
            return getIdentifierForScope(node.argument);

        case 'MemberExpression':
            return getIdentifierForScope(node.object);

        case 'CallExpression':
            return getIdentifierForScope(node.callee);
    }

    console.warn(`Unexpected node type "${node.type}" for scope identifier`);
    return node;
}

function getDeclaredVars(value: any, vars = new Set<string>()): Set<string> {
    if (Array.isArray(value)) {
        for (const chunk of value) {
            getDeclaredVars(chunk, vars);
        }
    } else if (isTemplateChunk(value)) {
        getDeclaredVars(value.value, vars);
    } else if (isTemplateSymbol(value) && value.type === 'variable' && value.index === -1) {
        vars.add(value.id);
    }

    return vars;
}