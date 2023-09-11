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

    constructor(ast?: ESTree.Program) {
        this.options = { ...defaultOptions };
        // TODO извлечь названия символов из AST
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