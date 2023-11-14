import type * as ESTree from 'estree';
import { isFunctionDeclaration } from './analyze';

interface EndorphinContextOptions {
    component: string;
    computed: string;
    template: string;
}

const defaultOptions: EndorphinContextOptions = {
    component: 'defineComponent',
    computed: 'computed',
    template: 'html',
}

/**
 * Контекст публичных символов из Endorphin, используемых для создания
 * и жизненного цикла компонентов
 */
export default class EndorphinContext {
    private options: EndorphinContextOptions;
    private extractedSymbols: Set<string>;

    /**
     * @param {ESTree.Node} ast - Абстрактное синтаксическое дерево (AST) программы.
     */
    constructor(ast?: ESTree.Node) {
        this.options = { ...defaultOptions };
        this.extractedSymbols = new Set();
        if (ast) {
            this.extractSymbolsFromAST(ast);
        }
    }

    /**
     * Извлекает символы из AST.
     * @param {ESTree.Node} node - Узел AST.
     */
    private extractSymbolsFromAST(node: ESTree.Node) {
        if (node.type === 'ImportDeclaration') {
            this.processImportDeclaration(node);
        }

        if ('body' in node) {
            if (Array.isArray(node.body)) {
                for (const statement of node.body) {
                    this.extractSymbolsFromAST(statement);
                }
            } else if (node.body && node.body.type) {
                this.extractSymbolsFromAST(node.body);
            }
        }
    }

    /**
     * Обрабатывает узел импорта в AST и извлекает символы.
     * @param {ESTree.ImportDeclaration} node - Узел импорта в AST.
     */
    private processImportDeclaration(node: ESTree.ImportDeclaration) {
        const { specifiers } = node;

        for (const specifier of specifiers) {
            if (specifier.type === 'ImportSpecifier') {
                const localName = specifier.local.name;
                this.registerSymbol(localName);
            }
        }
    }

    /**
     * Регистрирует символ в наборе извлеченных символов.
     * @param {string} localName - Локальное имя символа.
     */
    private registerSymbol(localName: string) {
        this.extractedSymbols.add(localName);
    }

    /**
     * Проверяет, является ли символ компонентом.
     * @param {string} symbol - Имя символа.
     * @returns {boolean} Возвращает true, если символ является компонентом, иначе false.
     */
    isComponentSymbol(symbol: string): boolean {
        return this.extractedSymbols.has(symbol);
    }

    /**
     * Вернёт `true` если указанный узел является явным определением компонента,
     * то есть это вызов функции `defineComponent()` с коллбэком в качестве первого
     * аргумента
     */
    isExplicitComponentDeclaration(node: ESTree.Node): node is ESTree.CallExpression {
        if (node.type === 'CallExpression' && node.arguments.length) {
            const { callee } = node;
            return callee.type === 'Identifier'
                && callee.name === this.options.component
                && isFunctionDeclaration(node.arguments[0]);
        }

        return false;
    }

    /**
     * Вернёт `true` если указанная функция является неявной фабрикой компонента:
     * возвращает template literal с тэгом `html`
     */
    isComponentFactory(node: ESTree.Node): node is ESTree.Function {
        if (!isFunctionDeclaration(node)) {
            return false;
        }

        if (node.body.type === 'BlockStatement') {
            const returnStatement = node.body.body.find(expr => expr.type === 'ReturnStatement') as ESTree.ReturnStatement | undefined;
            const arg = returnStatement?.argument;
            if (!arg) {
                return false;
            }

            if (this.isTemplate(arg)) {
                return true;
            }

            if (arg.type === 'ObjectExpression') {
                return arg.properties.some(prop => {
                    return prop.type === 'Property' && this.isTemplate(prop.value)
                });
            }

            return false;
        }

        return this.isTemplate(node.body);
    }

    isComputed(node: ESTree.Node): node is ESTree.CallExpression {
        return node.type === 'CallExpression'
            && node.callee.type === 'Identifier'
            && node.callee.name === this.options.computed;
    }

    isTemplate(node: ESTree.Node): node is ESTree.TaggedTemplateExpression {
        return node.type === 'TaggedTemplateExpression'
            && node.tag.type === 'Identifier'
            && node.tag.name === this.options.template;
    }
}