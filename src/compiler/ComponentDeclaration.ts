import type * as ESTree from 'estree';
import Context from './Context';
import Scope from './Scope';
import { SymbolAnalysisResult, TemplateSource, isFunctionDeclaration, runSymbolAnalysis } from './analyze';
import parse, { type AST } from '../parser';
import Patcher from './Patcher';
import { capitalize, quoted } from '../shared/utils';

interface Patch {
    pos: number;
    text: string;
}

interface Mask {
    /** Биты маски */
    bits: number;
    /** Символы из скоупа, которые испольховались в маске */
    symbols: string[];
}

/**
 * Поддерживаемые модификаторы событий
 */
const supportedModifiers = new Set(['stop', 'stopPropagation', 'prevent', 'preventDefault', 'passive']);

/**
 * Декларация компонента: его внутренний скоуп и патчи для финального кода
 */
export default class ComponentDeclaration {
    /** Имя компонента */
    public name = 'component';
    public scope: Scope;
    public template?: {
        ast: AST.ENDTemplate;
        entry: ESTree.Node;
    };

    private fnScopes: SymbolAnalysisResult['fnScopes'];
    private _invalidateSymbol: string | undefined;
    private scopeSymbols = new Map<string, number>();
    private templateSrc?: TemplateSource;
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
            this.templateSrc = template;
            this.template = {
                ast: parse(template.ast.quasi),
                entry: template.entry
            };

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

    private get invalidateSymbol(): string {
        if (!this._invalidateSymbol) {
            this._invalidateSymbol = this.scope.id('invalidate');
        }

        return this._invalidateSymbol;
    }

    /**
     * Компилирует текущие компонент и записывает все изменения в указанный патчер
     */
    public compile(patcher: Patcher) {
        const { template, templateSrc, scope } = this;
        if (!template || !templateSrc) {
            return;
        }

        // Компилируем все обработчики событий
        for (const event of template.ast.events) {
            const patch = this.compileEventHandler(event.handler);
            if (patch) {
                patcher.prepend(patch.pos, patch.text, true);
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

        // Код для связывания данных внутри компонента
        for (const patch of this.bootstrap()) {
            patcher.prepend(patch.pos, patch.text, true);
        }

        this.patchComputed(patcher);

        // TODO сгенерировать код для эффектов
        // TODO скомпилировать шаблоны
        // TODO сгенерировать код обновления пропсов
    }

    /**
     * Возвращает индекс для AST-узла переменной, используемой в шаблоне
     */
    public getScopeSlot(node: ESTree.Node): number | undefined {
        return this.astNodeLookup.get(node);
    }

    /**
     * Компилирует обработчик событий при необходимости и возвращает код для него.
     * Обработчик компилируется только если он является выражением либо содержит
     * модификаторы в самом событии. Если обработчик скомпилировался, в самой
     * директиве будет он будет заменён на новый AST-узел.
     */
    private compileEventHandler(handler: AST.ENDDirective): Patch | undefined {
        const { name, modifiers } = this.parseEvent(handler);
        const { value } = handler;
        const templateScope = this.templateSrc!.scope;
        let mod = eventModifiers(modifiers);

        if (!value || (!mod && value.type === 'Identifier')) {
            // Ничего не надо делать, можно указать переданный указатель как
            // хэндлер события
            return;
        }

        const patcher = new Patcher(this.ctx.code, value);
        let eventHandlerSymbol = '';

        if (isFunctionDeclaration(value)) {
            const scope = this.fnScopes.get(value);

            if (!scope) {
                this.ctx.error('Unknown scope for handler', value);
                return;
            }

            // Уже указали функцию, нужно её вынести из шаблона и добавить
            // модификаторы. Если функция анонимная, дать ей имя
            if (!('id' in value) || !value.id) {
                eventHandlerSymbol = this.scope.id(`on${capitalize(name)}`);
                patcher.prepend(value.start, `const ${eventHandlerSymbol} = `);
            } else {
                eventHandlerSymbol = value.id.name;
            }

            if (mod) {
                // Определяем название аргумента c событием
                let eventSymbol = '';
                const firstArg = value.params[0];
                if (!firstArg) {
                    // На случай если внутри коллбэка уже будет своя переменная `event`,
                    // воспользуемся скоупом функции, чтобы выделить отдельную переменную

                    eventSymbol = scope.id('event');
                    const pos = patcher.code.slice(value.start, value.end).indexOf('(');
                    if (pos !== -1) {
                        patcher.prepend(value.start + pos, eventSymbol);
                    } else {
                        this.ctx.warn('Invalid event declaration', value);
                    }
                } else if (firstArg.type === 'Identifier') {
                    eventSymbol = firstArg.name;
                } else {
                    this.ctx.warn('Unexpected argument type', firstArg);
                }

                if (eventSymbol) {
                    if (value.body.type === 'BlockStatement') {
                        // Тело функции завёрнуто в {...}, добавляем модификаторы внутрь
                        patcher.append(value.body.start + 1, mod(eventSymbol));
                    } else {
                        // Тело без скобок, просто выражение
                        patcher.wrap(value.body, `{ ${mod(eventSymbol)} return `, ' }');
                    }
                }
            }
        } else {
            // Записали выражение: нужно превратить его в функцию
            eventHandlerSymbol = this.scope.id(`on${capitalize(name)}`);
            let eventSymbol = '';
            let modStr = '';
            if (mod) {
                eventSymbol = 'event';
                modStr = mod(eventSymbol);
            }
            patcher.wrap(value, `function ${eventHandlerSymbol}(${eventSymbol}) { ${modStr}`, ' }');
        }

        if (eventHandlerSymbol) {
            // Пропатчим обновления, символы которых были объявлены
            // в скоупе фабрики компонента
            for (const [symbol, nodes] of templateScope.updates) {
                if (!this.shouldInvalidate(symbol)) {
                    // Модификация символа, объявленного за пределами фабрики компонента.
                    // Либо символ не используется в шаблоне
                    // TODO а если используется в `computed`?
                    continue;
                }
                for (let n of nodes) {
                    this.patchInvalidate(patcher, symbol, n);
                }
            }

            this.pushSymbol(eventHandlerSymbol);
            handler.value = {
                type: 'Identifier',
                name: eventHandlerSymbol,
                start: value.start,
                end: value.end
            };

            return {
                pos: this.getInsertionPoint('after'),
                text: patcher.render()
            };
        }
    }

    /**
     * Парсит данные о событии и его модификаторов из названия атрибута
     */
    private parseEvent(dir: AST.ENDDirective) {
        const sep = '|';
        const [name, ...modifiersList] = dir.name.split(sep);
        const modifiers = new Set<string>();
        let offset = dir.prefix.length + name.length + sep.length;
        for (const m of modifiersList) {
            if (supportedModifiers.has(m)) {
                modifiers.add(m);
            } else {
                this.ctx.warn(`Unknown event modifier "${m}"`, [offset, offset + m.length]);
            }
        }

        return { name, modifiers };
    }

    /**
     * Патчинг инвалидации данных: все изменения отслеживаемых локальных переменных
     * заворачивает в вызов `invalidate`
     */
    private patchInvalidate(patcher: Patcher, name: string, node: ESTree.Node) {
        const index = this.scopeSymbols.get(name);
        if (index == null) {
            this.ctx.error(`Unknown scope symbol "${name}"`);
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
                    deps.push(quoted(symbol));
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
            const usages = this.templateSrc?.scope.usages.get(name);
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
    private bootstrap(): Patch[] {
        const result: Patch[] = [];

        result.push({
            pos: this.getInsertionPoint('before'),
            text: this.createContext()
        });

        if (this.scopeSymbols.size) {
            result.push({
                pos: this.getInsertionPoint('after'),
                text: this.setupContext()
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
    private setupContext(): string {
        const templateScope = this.templateSrc!.scope;

        // Собираем маску шаблона из переменных, от которых зависит рендеринг
        const refs: string[] = [];
        for (const symbol of templateScope.usages.keys()) {
            // Если значение не меняется, ре-рендеринг шаблона не зависит от него
            if (this.scope.updates.has(symbol) || this.scope.computed.has(symbol)) {                refs.push(symbol);
            }
        }

        const setup = this.ctx.useInternal('setupContext');
        const mask = this.getMask(refs);
        return `${setup}([${Array.from(this.scopeSymbols.keys()).join(', ')}], ${mask.bits} /* ${mask.symbols.join(' | ')} */);`;
    }

    /**
     * Вернёт `true` если указанный символ требует инвалидации на изменение
     */
    private shouldInvalidate(symbol: string): boolean {
        const { scope, templateSrc } = this;

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

function eventModifiers(modifiers: Set<string>): ((name: string) => string) | undefined {
    let result = '';
    if (modifiers.has('stop') || modifiers.has('stopPropagation')) {
        result += `EVENT.stopPropagation();`;
    }

    if (modifiers.has('prevent') || modifiers.has('preventDefault')) {
        result += `EVENT.preventDefault();`;
    }

    if (result) {
        return name => result.replace(/EVENT/g, name);
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
        ...templateScope.updates.keys(),
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