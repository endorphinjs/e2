import type * as ESTree from 'estree';
import Context from './Context';
import Scope from './Scope';
import Patcher from './Patcher';
import logger from './logger';
import { SymbolAnalysisResult, TemplateSource, runSymbolAnalysis } from './analyze';
import parse, { type AST } from '../parser';
import compileTemplate from './template';
import compileEventHandler from './template/event';

interface Patch {
    pos: number;
    text: string;
}

interface Mask {
    /** Биты маски */
    bits: number;
    /** Символы из скоупа, которые использовались в маске */
    symbols: string[];
}

/**
 * Декларация компонента: его внутренний скоуп и патчи для финального кода
 */
export default class ComponentDeclaration {
    /** Имя компонента */
    public name = 'component';
    public scope: Scope;
    public template?: AST.ENDTemplate;

    public fnScopes: SymbolAnalysisResult['fnScopes'];
    private _invalidateSymbol: string | undefined;
    private scopeSymbols = new Map<string, number>();
    private templateSource?: TemplateSource;
    /**
     * Лукап узлов в AST шаблона и соответствующих индексов в скоупе.
     * Если индекс присутствует, значит переменная для узла была объявлена
     * внутри фабрики компонента и её присвоен указанный слот. Если нет —
     * переменная объявлена за пределами фабрики
     */
    private astNodeLookup = new Map<ESTree.Node, number>();

    /**
     * @param ctx Контекст компиляции модуля
     * @param node AST-узел функции-фабрики компонента
     */
    constructor(public ctx: Context, public node: ESTree.Function) {
        if (node.type === 'FunctionDeclaration' && node.id) {
            this.name = node.id.name;
        }

        const { scope, fnScopes, template } = runSymbolAnalysis(node, ctx);
        this.scope = scope;
        this.fnScopes = fnScopes;

        if (template) {
            this.templateSource = template;
            this.template = parse(template.ast.quasi);

            // Собираем символы, которые понадобятся для скоупа
            for (const symbol of getTemplateScopeSymbols(scope, template.scope)) {
                this.pushSymbol(symbol);
            }

            // Собираем символы, которые используются в computed-переменных
            scope.computed.forEach((entry) => {
                for (const dep of entry.deps) {
                    if (!scope.computed.has(dep)) {
                        // Если зависимость является computed-свойством, не добавляем
                        // её в скоуп, так как можем самостоятельно отследить её
                        this.pushSymbol(dep);
                    }
                }
            });
        }
    }

    public get invalidateSymbol(): string {
        if (!this._invalidateSymbol) {
            this._invalidateSymbol = this.scope.id('invalidate');
        }

        return this._invalidateSymbol;
    }

    /**
     * Компилирует текущие компонент и записывает все изменения в указанный патчер
     */
    public compile(patcher: Patcher = this.ctx.patcher) {
        const { template, scope } = this;
        if (!template) {
            return;
        }

        // Компилируем все обработчики событий
        for (const event of template.events) {
            const handler = compileEventHandler(this, event.handler);
            if (handler) {
                event.handler.value = handler.node;
                this.pushSymbol(handler.node.name);
                patcher.prepend(this.getInsertionPoint('after'), handler.code, true);
            }
        }

        // Патчим обновления переменных
        for (const [symbol, nodes] of scope.updates) {
            if (this.shouldInvalidate(symbol)) {
                for (const node of nodes) {
                    this.patchInvalidate(patcher, symbol, node);
                }
            }
        }

        // Компилируем шаблон и получаем ссылку на функцию шаблона
        const templateSymbol = compileTemplate(this);

        // Код для связывания данных внутри компонента
        for (const patch of this.bootstrap(templateSymbol)) {
            patcher.prepend(patch.pos, patch.text, true);
        }

        // Обновление computed-свойств
        this.patchComputed(patcher);

        // Обновление пропсов
        this.propsUpdate(patcher);

        // TODO сгенерировать код для эффектов
    }

    /**
     * Возвращает индекс для AST-узла переменной, используемой в шаблоне
     */
    public getScopeSlot(node: ESTree.Node): number | undefined {
        return this.astNodeLookup.get(node);
    }

    /**
     * Патчинг инвалидации данных: все изменения отслеживаемых локальных переменных
     * заворачивает в вызов `invalidate`
     */
    public patchInvalidate(patcher: Patcher, name: string, node: ESTree.Node) {
        const index = this.scopeSymbols.get(name);
        if (index == null) {
            logger.error(`Unknown scope symbol "${name}"`);
        } else {
            const suffix = node.type === 'UpdateExpression' && !node.prefix
                ? `, ${patcher.substr(node.argument)}`
                : '';
            patcher.wrap(node, `${this.invalidateSymbol}(${index}, `, `${suffix})`);
        }
    }

    /**
     * Патчит computed-значения
     */
    private patchComputed(patcher: Patcher) {
        const { scope } = this;
        scope.computed.forEach((entry, id) => {
            let slot = this.scopeSymbols.get(id);
            const deps: string[] = [];
            for (const symbol of entry.deps) {
                if (scope.computed.has(symbol)) {
                    deps.push(symbol);
                } else if (this.scopeSymbols.has(symbol)) {
                    deps.push(String(this.scopeSymbols.get(symbol)));
                } else {
                    this.ctx.warn(`Unexpected scope symbol "${symbol}"`, entry.node);
                }
            }

            if (deps.length || slot != null) {
                let args = `, [${deps.join(', ')}]`;
                if (slot != null) {
                    args += `, ${slot}`;
                }

                patcher.append(entry.node.end - 1, args);
            }

            // Заворачиваем все чтения computed-переменной в вызовы
            const usages = scope.usages.get(id);
            if (usages) {
                for (let node of usages) {
                    if (node.type === 'MemberExpression') {
                        node = node.object;
                    }
                    patcher.wrap(node, `${this.ctx.useInternal('getComputed')}(`, ')');
                }
            }
        });
    }

    private pushSymbol(name: string) {
        if (!this.scopeSymbols.has(name)) {
            this.scopeSymbols.set(name, this.scopeSymbols.size);
            const usages = this.templateSource?.scope.usages.get(name);
            if (usages) {
                const index = this.scopeSymbols.get(name)!;
                for (const node of usages) {
                    this.astNodeLookup.set(node, index);
                }
            }
        }
    }

    /**
     * Добавляет код, необходимый для инициализации компонента
     */
    private bootstrap(templateSymbol: string): Patch[] {
        const result: Patch[] = [];

        result.push({
            pos: this.getInsertionPoint('before'),
            text: this.createContext()
        });

        if (this.scopeSymbols.size) {
            result.push({
                pos: this.getInsertionPoint('after'),
                text: this.setupContext(templateSymbol)
            });
        }

        return result;
    }

    /**
     * Возвращает код для создания контекста рендеринга
     */
    private createContext(): string {
        let createContext = `${this.ctx.useInternal('createContext')}();`;
        if (this._invalidateSymbol) {
            createContext = `const ${this._invalidateSymbol} = ${createContext}`;
        }

        return createContext;
    }

    /**
     * Возвращает код для настройки контекста
     */
    private setupContext(templateSymbol: string): string {
        const templateScope = this.templateSource!.scope;

        // Собираем маску шаблона из переменных, от которых зависит рендеринг
        const refs: string[] = [];
        for (const symbol of templateScope.usages.keys()) {
            // Если значение не меняется, ре-рендеринг шаблона не зависит от него
            if (this.scope.updates.has(symbol) || this.scope.computed.has(symbol)) {
                refs.push(symbol);
            }
        }

        const setup = this.ctx.useInternal('setupContext');
        const mask = this.getMask(refs);
        return `${setup}([${Array.from(this.scopeSymbols.keys()).join(', ')}], ${templateSymbol}, ${mask.bits} /* ${mask.symbols.join(' | ')} */);`;
    }

    /**
     * Возвращает код функции обновления пропсов
     */
    private propsUpdate(patcher: Patcher) {
        const { ast } = this.templateSource!;
        const nextPropsArg = this.scope.id('nextProps');
        const chunks: string[] = [];

        this.scope.props.forEach(([propName, propType], symbol) => {
            let chunk = '';
            switch (propType) {
                case 'container':
                    chunk = `${symbol} = ${nextPropsArg}`;
                    break;
                case 'prop':
                    chunk = `${symbol} = ${nextPropsArg}.${propName}`;
                    break;
                case 'rest':
                    // TODO поддержать rect-аргумент
                    break;
            }

            // TODO найти декларацию пропсов и заменить `const` на `let`

            if (chunk) {
                const index = this.scopeSymbols.get(symbol);
                if (index != null) {
                    chunk = `${this.invalidateSymbol}(${index}, ${chunk})`;
                }
                chunks.push(chunk);
            }
        });

        patcher.replace(ast, `(${nextPropsArg}) => { ${chunks.join(';')} }`);
    }

    /**
     * Вернёт `true` если указанный символ требует инвалидации на изменение
     */
    private shouldInvalidate(symbol: string): boolean {
        const { scope, templateSource: templateSrc } = this;

        if (scope.declarations.has(symbol) && templateSrc?.scope.usages.has(symbol)) {
            return true;
        }

        for (const computed of scope.computed.values()) {
            if (computed.deps.has(symbol)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Возвращает оптимальную позицию для вставки кода
     * @param type Какая именно позиция нужна: в начале кода шаблона (before)
     * или в конце (after)
     */
    private getInsertionPoint(type: 'before' | 'after'): number {
        const { node } = this;

        if (node.body.type === 'BlockStatement') {
            const refNode = type === 'before'
                ? node.body.body[0]
                : node.body.body.find(child => child.type === 'ReturnStatement');

            if (refNode) {
                return refNode.start;
            }

            return type === 'before' ? node.body.start + 1 : node.body.end - 1;
        }

        // Тело функции — выражение
        return node.body.start;
    }

    /**
     * Собирает маску для указанных символов
     * @param symbols
     */
    private getMask(refs: string[]): Mask {
        let bits = 0;
        const symbols: string[] = [];

        for (const symbol of refs) {
            const index = this.scopeSymbols.get(symbol);
            if (index != null) {
                bits |= 1 << index;
                symbols.push(symbol);
            } else {
                this.ctx.warn(`Unknown template symbol: "${symbol}"`);
            }
        }

        return { bits, symbols };
    }
}

/**
 * Возвращает список символов, которые используются в шаблоне и которые были
 * объявлены внутри фабрики компонента
 */
function getTemplateScopeSymbols(componentScope: Scope, templateScope: Scope): string[] {
    const lookup = new Map<string, number>();
    const allKeys = new Set([
        ...templateScope.usages.keys(),
        // ...templateScope.updates.keys(),
    ]);
    const symbols: string[] = [];

    // Оставляем только те символы, которые были объявлены в фабрике
    for (const key of allKeys) {
        if (componentScope.declarations.has(key)) {
            lookup.set(key, symbols.length);
            symbols.push(key);
        }
    }

    const getWeight = (name: string) => {
        if (componentScope.updates.has(name) && componentScope.declarations.has(name)) {
            return 2;
        }

        if (templateScope.updates.has(name)) {
            return 1;
        }

        return 0;
    }

    // Символы, которые обновляются, нужно подтянуть ближе к началу, чтобы они
    // уместились в ограничение маски 2^31 - 1
    return symbols.sort((a, b) => {
        return (getWeight(b) - getWeight(a)) || (lookup.get(a)! - lookup.get(b)!);
    });
}