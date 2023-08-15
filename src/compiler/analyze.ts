import type * as ESTree from 'estree';
import { traverse } from 'estraverse';
import Scope from './Scope';
import { at, findLast, findLastIndex, last } from '../shared/utils';

interface SymbolAnalysisResult {
    scope: Scope;
    template?: ESTree.TaggedTemplateExpression;
    templateScope?: Scope;
}

/**
 * Вернёт список узлов, которые содержат описания коллбэки для описания компонента
 */
export function findComponentCallbacks(program: ESTree.Node, ctx = new EndorphinContext()): ESTree.Node[] {
    const result: ESTree.Node[] = [];

    traverse(program, {
        enter(node) {
            if (ctx.isComponentFactory(node)) {
                result.push(node.arguments[0]);
                this.skip();
            }
        }
    });

    return result;
}

export function runSymbolAnalysis(root: ESTree.Node, ctx = new EndorphinContext()): SymbolAnalysisResult {
    const parents: ESTree.Node[] = [];
    const scopeStack: Scope[]  = [];
    let rootScope: Scope | null = null;
    let template: ESTree.TaggedTemplateExpression | undefined;
    let templateScope: Scope | undefined;

    /*
    TODO строить зависимости на вызов функций:
    defineComponent(({ foo, bar }) => {
        function getName() {
            return foo + bar;
        }

        return html`<div>${getName()}</div>`;
    });
    В этом случае нужно указать, что шаблон зависит от `foo` и `bar`, а также сам
    вызов `getName()` (dirty-флаг)
    */

    traverse(root, {
        enter(node, parent) {
            if (ctx.isTemplate(node)) {
                templateScope = new Scope();
                template = node;
                scopeStack.push(templateScope);
            } else if (isBlockEnter(node, parent)) {
                // Зашли в блок со своей областью видимости
                const scope = new Scope();
                scopeStack.push(scope);
                if (parent) {
                    if (isFunctionDeclaration(parent)) {
                        // Это тело функции: добавим все аргументы функции в новый скоуп
                        for (const param of parent.params) {
                            for (const name of getDeclaredNames(param)) {
                                scope.addDeclaration(name, param);
                            }
                        }

                        const prevParent = at(parents, -2);
                        if (!prevParent || ctx.isComponentFactory(prevParent)) {
                            collectPropsFromFunction(parent, scope);
                        }
                    } else if (parent.type === 'CatchClause' && parent.param) {
                        for (const name of getDeclaredNames(parent.param)) {
                            scope.addDeclaration(name, parent.param);
                        }
                    }
                }
            }

            if (node.type === 'CallExpression') {
                if (ctx.isComputed(node, parent) && parent.id.type === 'Identifier') {
                    last(scopeStack)?.pushComputed(parent.id.name);
                }
            } else if (node.type === 'Identifier') {
                if (parent && ctx.isTemplate(parent) && parent.tag === node) {
                    // skip
                } else {
                    const scope = last(scopeStack);
                    if (scope) {
                        handleIdentifier(scope, node, parents);
                    }
                }
            }

            parents.push(node);
        },
        leave(node, parent) {
            parents.pop();

            if (ctx.isTemplate(node)) {
                scopeStack.pop();
            } else if (isBlockEnter(node, parent)) {
                const scope = scopeStack.pop();
                if (scope) {
                    const prev = last(scopeStack);
                    if (prev) {
                        prev.transfer(scope);
                    } else if (!rootScope) {
                        rootScope = scope;
                    }
                }
            }

            if (node.type === 'CallExpression') {
                if (ctx.isComputed(node, parent) && parent.id.type === 'Identifier') {
                    last(scopeStack)?.popComputed();
                }
            } else if (node.type === 'VariableDeclarator') {
                // Проверим объявление пропсов в теле фабрики
                const { id, init } = node;
                const scope = last(scopeStack)!;

                if (id.type === 'ObjectPattern' && init?.type === 'Identifier') {
                    // const { prop1, prop2 } = props;
                    if (scope.propType(init.name) === 'container') {
                        propsFromObjectPattern(id, scope);
                    }
                } else if (id.type === 'Identifier' && init?.type === 'MemberExpression') {
                    // const prop1 = props.prop1;
                    if (init.object.type === 'Identifier'
                        && scope.propType(init.object.name) === 'container'
                        && init.property.type === 'Identifier') {
                        scope.setProp(id.name, 'prop', init.property.name);
                    }
                }
            } else if (node.type === 'Identifier') {
                const scope = last(scopeStack);
                if (scope && ctx.isComputed(node, parent)) {
                    scope.popComputed();
                }
            }
        }
    });

    return {
        scope: rootScope!,
        template,
        templateScope
    };
}



function getDeclaredNames(node: ESTree.Pattern): string[] {
    switch (node.type) {
        case 'Identifier':
            return [node.name];
        case 'RestElement':
            return getDeclaredNames(node.argument);
        case 'ArrayPattern':
            return node.elements.reduce((acc, elem) => elem ? acc.concat(getDeclaredNames(elem)) : acc, [] as string[]);
        case 'ObjectPattern':
            return node.properties.reduce((acc, elem) => acc.concat(getDeclaredNames(elem.type === 'Property' ? elem.value : elem.argument)), [] as string[]);
    }

    return [];
}

function isFunctionDeclaration(node: ESTree.Node): node is ESTree.Function {
    return node.type === 'ArrowFunctionExpression'
        || node.type === 'FunctionExpression'
        || node.type === 'FunctionDeclaration';
}

/**
 * Обрабатывает указатель на идентификатор. Если вернёт `false`, значит, функция
 * не смогла или не захотела определять контекст этого идентификатора
 */
function handleIdentifier(scope: Scope, node: ESTree.Identifier, parents: ESTree.Node[]): void {
    const parent = last(parents);

    const isFunctionParam = () => {
        const ix = findLastIndex(parents, isFunctionDeclaration);
        return ix !== -1
            ? (parents[ix] as ESTree.Function).params.includes(parents[ix + 1] as ESTree.Pattern)
            : false;
    }

    switch (parent?.type) {
        // Fast path: быстрые типовые проверки без глубокого исследования узлов
        case 'VariableDeclarator':
            if (parent.id === node) {
                return scope.addDeclaration(node.name, at(parents, -2)!);
            }
            break;

        case 'ArrowFunctionExpression':
        case 'FunctionDeclaration':
        case 'FunctionExpression':
            if (parent.params.includes(node)) {
                return;
            }

            if ('id' in parent && parent.id === node && at(parents, -2)?.type !== 'MethodDefinition') {
                return scope.addDeclaration(node.name, parent);
            }
            break;
        case 'ClassExpression':
        case 'ClassDeclaration':
            if (parent.id === node) {
                return scope.addDeclaration(node.name, parent);
            }
            break;

        case 'AssignmentExpression':
            if (parent.left === node) {
                return scope.addUpdate(node.name, parent);
            }
            return scope.addUsage(node.name, node);

        case 'UpdateExpression':
            if (parent.argument === node) {
                return scope.addUpdate(node.name, parent);
            }
            break;

        case 'BinaryExpression':
        case 'ConditionalExpression':
            return scope.addUsage(node.name, node);

        case 'CatchClause':
            if (parent.param === node) {
                return;
            }

            break;

        // Деструктуризация массива: либо присвоение, либо декларация
        case 'RestElement':
        case 'ArrayPattern':
            if (!isFunctionParam()) {
                scope.add(node.name, findLast(parents, declareOrAssign));
            }
            return;

        case 'Property': {
            // Свойство объекта: может быть и деструктуризация, и создание объекта
            const prevParent = at(parents, -2);

            if (prevParent?.type === 'ObjectPattern') {
                if (parent.value === node && parent.kind === 'init' && !isFunctionParam()) {
                    scope.add(node.name, findLast(parents, declareOrAssign));
                }
            } else if (prevParent?.type === 'ObjectExpression') {
                if (parent.kind === 'init' && (parent.value === node || parent.computed)) {
                    // Чтение значения
                    scope.add(node.name, node);
                }
            }
            return;
        }

        case 'MemberExpression': {
            if (parent.object !== node) {
                // Это промежуточный идентификатор пути
                return;
            }

            const entryIx = findLastIndex(parents, n => n.type !== 'MemberExpression');
            if (entryIx !== -1) {
                const entry = parents[entryIx];
                if (entry.type === 'UpdateExpression'
                    || (entry.type === 'AssignmentExpression' && entry.left === parents[entryIx + 1])) {
                    return scope.add(node.name, entry);
                }

                return scope.addUsage(node.name, parents[entryIx + 1]);
            }

            break;
        }
    }

    if (!isFunctionParam()) {
        // Если это аргумент, то пропускаем идентификатор: он был уже добавлен
        // при формировании нового скоупа
        scope.add(node.name, node);
    }
}

function declareOrAssign(node: ESTree.Node): node is ESTree.VariableDeclaration | ESTree.AssignmentExpression | ESTree.UpdateExpression {
    return node.type === 'VariableDeclaration'
        || node.type === 'AssignmentExpression'
        || node.type === 'UpdateExpression';
}

function isBlockEnter(node: ESTree.Node, parent: ESTree.Node | null): boolean {
    return node.type === 'BlockStatement'
        || (parent?.type === 'ArrowFunctionExpression' && node === parent.body);
}

function collectPropsFromFunction(fn: ESTree.Function, scope: Scope) {
    const param = fn.params[0];
    if (!param) {
        return;
    }

    if (param.type === 'Identifier') {
        scope.setProp(param.name, 'container');
    } else if (param.type === 'ObjectPattern') {
        propsFromObjectPattern(param, scope);
    }
}

function propsFromObjectPattern(obj: ESTree.ObjectPattern, scope: Scope) {
    for (const p of obj.properties) {
        // XXX поддержать больше сложных паттернов деструктуризации
        if (p.type === 'RestElement') {
            const arg = p.argument;
            if (arg.type === 'Identifier') {
                scope.setProp(arg.name, 'rest');
            }
        } else if (p.type === 'Property' && !p.computed) {
            if (p.key.type === 'Identifier' &&  p.value.type === 'Identifier') {
                scope.setProp(p.value.name, 'prop', p.key.name);
            }
        }
    }
}

/**
 * Символы из шаблона, отсортированные для лучшего упаковывания в маску изменений
 */
function sortedTemplateSymbols(scope: Scope, symbols: string[]): string[] {
    // Символы, которые обновляются, нужно подтянуть ближе к началу, чтобы они
    // уместились в ограничение маски 2^31 - 1
    const lookup = new Map<string, number>();
    symbols.forEach((name, ix) => lookup.set(name, ix));
    const hasUpdate = (name: string) => scope.updates.has(name) && scope.declarations.has(name);
    return symbols.slice().sort((a, b) => {
        const updateA = hasUpdate(a) ? 1 : 0;
        const updateB = hasUpdate(b) ? 1 : 0;
        return (updateA - updateB) || (lookup.get(a)! - lookup.get(b)!);
    });
}

interface EndorphinContextOptions {
    component: string;
    computed: string;
    template: string;
}

class EndorphinContext {
    private options: EndorphinContextOptions;

    constructor(options?: Partial<EndorphinContextOptions>) {
        this.options = {
            component: 'defineComponent',
            computed: 'computed',
            template: 'html',
            ...options
        };
    }

    isComponentFactory(node: ESTree.Node): node is ESTree.CallExpression {
        if (node.type === 'CallExpression' && node.arguments.length) {
            const { callee } = node;
            return callee.type === 'Identifier'
                && callee.name === this.options.component;
        }

        return false
    }

    isComputed(node: ESTree.Node, parent: ESTree.Node | null): parent is ESTree.VariableDeclarator {
        return node.type === 'CallExpression'
            && node.callee.type === 'Identifier'
            && node.callee.name === this.options.computed
            && parent?.type === 'VariableDeclarator';
    }

    isTemplate(node: ESTree.Node): node is ESTree.TaggedTemplateExpression {
        return node.type === 'TaggedTemplateExpression'
            && node.tag.type === 'Identifier'
            && node.tag.name === this.options.template;
    }
}
