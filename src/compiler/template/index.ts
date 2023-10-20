import { last } from '../../shared/utils';
import type ComponentDeclaration from '../ComponentDeclaration';
import TemplateFunction, { ctxArg, refsArgs, stageArg } from './TemplateFunction';
import type { TemplateVariable } from './types';
import traverseTemplate from './traverse';
import element from './element';
import type { ENDTemplate, ENDTemplateNode } from '../../parser/ast';

/**
 * Компилирует шаблон указанного компонента, добавляя все созданные функции
 * в контекст JS-модуля.
 * @returns Название созданной функции для обновления шаблона
 */
export default function compileTemplate(component: ComponentDeclaration) {
    const { ctx, template } = component;

    if (!template) {
        console.warn('No template in component');
        return '';
    }

    const id = ctx.scope.id(`${component.name}_template`);
    const fn = new TemplateFunction(component, id, [ctxArg, stageArg, refsArgs]);

    compileContents(template, fn);

    ctx.push(fn.render());
    return id;
}

function compileContents(node: ENDTemplateNode | ENDTemplate, fn: TemplateFunction) {
    const stack: TemplateVariable[] = [];

    traverseTemplate(node, {
        enter(node) {
            if (node.type === 'ENDElement') {
                stack.push(element(fn, node, last(stack)));
            }
        },
        leave(node) {
            if (node.type === 'ENDElement') {
                stack.pop();
            }
        }
    });
}