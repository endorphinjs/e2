import type * as ESTree from 'estree';
import { traverse } from 'estraverse';
import Scope from '../Scope';
import Patcher from '../Patcher';
import type ComponentDeclaration from '../ComponentDeclaration';
import type Context from '../Context';
import type { Chunk, TemplateArgument, TemplateFunctionArg, TemplateSymbol, TemplateVariable } from './types';
import { argument, isTemplateSymbol, variable } from './utils';

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
    expression(expr: ESTree.Node, symbol: (index: number) => string): string {
        const { component } = this;
        const { code } = component.ctx;
        const patcher = new Patcher(code, expr);
        traverse(expr, {
            enter(node) {
                const index = component.getScopeSlot(node);
                if (index != null) {
                    patcher.replace(getIdentifierForScope(node), symbol(index));
                }
            }
        });

        return patcher.render();
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
            result += `${indent}${renderChunk(ctx, chunk, refs)}`;
        }

        if (stage && refs) {
            const stageChunks: string[] = [];
            if (this.mountChunks.length) {
                stageChunks.push(`if (${stage.id} === 1) {${indent2}`
                    + `${refs.id}.length = ${this.refsIndex};${indent2}`
                    + this.mountChunks.map(c => renderChunk(ctx, c, refs)).join(indent2)
                    + `${indent}}`
                );
            }

            if (this.updateChunks.length) {
                stageChunks.push(`if (${stage.id} === 2) {${indent2}`
                    + this.updateChunks.map(c => renderChunk(ctx, c, refs)).join(indent2)
                    + `${indent}}`
                );
            }

            if (this.unmountChunks.length) {
                stageChunks.push(`if (${stage.id} === 3) {${indent2}`
                    + this.unmountChunks.map(c => renderChunk(ctx, c, refs)).join(indent2)
                    + `${indent}}`
                );
            }

            if (stageChunks.length) {
                result += indent + stageChunks.join(' else ');
            }
        }

        for (const chunk of this.afterChunks) {
            result += `${indent}${renderChunk(ctx, chunk, refs)}`;
        }

        result += '\n}\n';
        return result;
    }
}

function renderChunk(ctx: Context, chunk: Chunk, refs?: TemplateArgument): string {
    if (typeof chunk === 'string') {
        return chunk;
    }

    return chunk.map(c => {
        if (typeof c === 'string') {
            return c;
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