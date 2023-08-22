import type * as ESTree from 'estree';
import Context from './Context';
import Scope from './Scope';
import { SymbolAnalysisResult, isFunctionDeclaration, runSymbolAnalysis } from './analyze';
import parse, { type AST } from '../parser';
import Patcher, { patcherFromNode, type NodeMapping } from './Patcher';
import { capitalize } from '../shared/utils';

/**
 * Поддерживаемые модификаторы событий
 */
const supportedModifiers = new Set(['stop', 'stopPropagation', 'prevent', 'preventDefault', 'passive']);

/**
 * Декларация компонента: его внутренний скоуп и патчи для финального кода
 */
export default class ComponentDeclaration {
    public scope: Scope;
    public template?: {
        ast: AST.ENDTemplate;
        entry: ESTree.Node;
    };

    private fnScopes: SymbolAnalysisResult['fnScopes'];
    private chunks: string[] = [];
    private _invalidateSymbol: string | undefined;
    private scopeSymbols = new Map<string, number>();

    constructor(public ctx: Context, node: ESTree.Function) {
        const { scope, fnScopes, template } = runSymbolAnalysis(node, ctx.endorphin);
        this.scope = scope;
        this.fnScopes = fnScopes;

        if (template) {
            this.template = {
                ast: parse(template.ast.quasi),
                entry: template.entry
            };

            for (const symbol of getTemplateSymbols(scope, template.scope)) {
                this.pushSymbol(symbol);
            }

            // Компилируем все обработчики событий
            for (const event of this.template.ast.events) {
                this.compileEventHandler(event.handler, template.scope);
            }
        }
    }

    private get invalidateSymbol(): string {
        if (!this._invalidateSymbol) {
            this._invalidateSymbol = this.scope.id('invalidate');
        }

        return this._invalidateSymbol;
    }

    /**
     * Применяет все необходимые патчи для правильного рендеринга компонента
     */
    public applyPatches(patcher: Patcher) {
        // Патчим все обновления внутри компонента
        const { updates, declarations } = this.scope;
        const { template } = this;

        if (!template) {
            return;
        }

        for (const [symbol, nodes] of updates) {
            const index = this.scopeSymbols.get(symbol);
            if (declarations.has(symbol) && index != null) {
                for (const node of nodes) {
                    this.patchInvalidate(patcher, symbol, node);
                }
            }
        }

        if (this.chunks.length) {
            let pos = template.entry.start;
            if (template.entry.type === 'BlockStatement') {
                pos++;
            }

            patcher.prepend(pos, this.chunks.join('\n') + '\n');
        }


        // TODO вывести аргументы invalidate и setup
        // TODO описать код для invalidate и setup
        // TODO сгенерировать код для эффектов
        // TODO скомпилировать шаблоны
    }

    /**
     * Компилирует обработчик событий при необходимости и возвращает код для него.
     * Обработчик компилируется только если он является выражением либо содержит
     * модификаторы в самом событии. Если обработчик скомпилировался, в самой
     * директиве будет он будет заменён на новый AST-узел.
     */
    private compileEventHandler(handler: AST.ENDDirective, templateScope: Scope) {
        const { name, modifiers } = this.parseEvent(handler);
        const { value } = handler;
        let mod = eventModifiers(modifiers);

        if (!value || (!mod && value.type === 'Identifier')) {
            // Ничего не надо делать, можно указать переданный указатель как
            // хэндлер события
            return;
        }

        const nodeMapping: NodeMapping = new Map();
        const patcher = patcherFromNode(this.ctx.code, value, nodeMapping);
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
                patcher.prepend(0, `const ${eventHandlerSymbol} = `);
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
                    const pos = patcher.code.indexOf('(');
                    if (pos !== -1) {
                        patcher.prepend(pos, eventSymbol);
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
                        const mappedBody = nodeMapping.get(value.body);
                        if (mappedBody) {
                            patcher.wrap(mappedBody, `{ ${mod(eventSymbol)} return `, ' }');
                        } else {
                            this.ctx.warn('Unable to add modifiers: no mapped body', value.body);
                        }
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
            patcher.wrap(patcher.ast, `function ${eventHandlerSymbol}(${eventSymbol}) { ${modStr}`, ' }');
        }

        if (eventHandlerSymbol) {
            // Пропатчим обновления, символы которых были объявлены
            // в скоупе фабрики компонента
            for (const [symbol, nodes] of templateScope.updates) {
                if (!this.scope.declarations.has(symbol)) {
                    // Модификация символа, объявленного за пределами фабрики компонента
                    continue;
                }
                for (let n of nodes) {
                    const mapped = nodeMapping.get(n);
                    if (mapped) {
                        this.patchInvalidate(patcher, symbol, mapped);
                    }
                }
            }

            this.pushSymbol(eventHandlerSymbol);
            this.chunks.push(patcher.render());
            handler.value = {
                type: 'Identifier',
                name: eventHandlerSymbol,
                start: value.start,
                end: value.end
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

    private pushSymbol(name: string) {
        if (!this.scopeSymbols.has(name)) {
            this.scopeSymbols.set(name, this.scopeSymbols.size);
        }
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

function getTemplateSymbols(componentScope: Scope, templateScope: Scope): string[] {
    const lookup = new Map<string, number>();
    const symbols = [
        ...templateScope.usages.keys(),
        ...templateScope.updates.keys()
    ];

    const hasUpdate = (name: string) => (componentScope.updates.has(name) && componentScope.declarations.has(name))
        || templateScope.updates.has(name);

    symbols.forEach((name, ix) => !lookup.has(name) && lookup.set(name, ix));

    // Символы, которые обновляются, нужно подтянуть ближе к началу, чтобы они
    // уместились в ограничение маски 2^31 - 1
    return symbols.sort((a, b) => {
        const updateA = hasUpdate(a) ? 1 : 0;
        const updateB = hasUpdate(b) ? 1 : 0;
        return (updateA - updateB) || (lookup.get(a)! - lookup.get(b)!);
    });
}