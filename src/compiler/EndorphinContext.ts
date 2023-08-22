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

    isComponentFactory(node: ESTree.Node): node is ESTree.CallExpression {
        if (node.type === 'CallExpression' && node.arguments.length) {
            const { callee } = node;
            return callee.type === 'Identifier'
                && callee.name === this.options.component
                && isFunctionDeclaration(node.arguments[0]);
        }

        return false;
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