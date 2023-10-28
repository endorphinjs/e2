import { last } from '../../shared/utils';
import type ComponentDeclaration from '../ComponentDeclaration';
import TemplateFunction, { ctxArg, refsArgs, stageArg } from './TemplateFunction';
import type { TemplateVariable } from './types';
import traverseTemplate, { TemplateNode } from './traverse';
import element from './element';
import type { ENDContent, ENDIfStatement, ENDStatement, ENDTemplate } from '../../parser/ast';
import { internal, isTemplateNode, raw, t } from './utils';

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

    compileContents(component, template, fn);

    ctx.push(fn.render());
    return id;
}

function compileContents(component: ComponentDeclaration, node: ENDStatement | ENDTemplate, fn: TemplateFunction) {
    const stack: TemplateVariable[] = [];

    traverseTemplate(node, {
        enter(node, parent) {
            if (node.type === 'ENDTemplate' || isTemplateNode(node)) {
                switch (node.type) {
                    case 'ENDElement':
                        stack.push(element(fn, node, last(stack)));
                        break;
                    case 'ENDIfStatement':
                        ifStatement(component, node, fn);
                        return this.skip();
                }
            } else {
                // Компиляция выражения как текста
                // TODO отсекать текст, который отвечает только за форматирование
                text(fn, node, parent, last(stack));
            }
        },
        leave(node) {
            if (node.type === 'ENDElement') {
                stack.pop();
            }
        }
    });
}

/**
 * Компиляция блока <if>
 */
function ifStatement(component: ComponentDeclaration, node: ENDIfStatement, fn: TemplateFunction) {
    const { ctx } = component;

    const id = ctx.scope.id(`${component.name}_if`);
    const v = fn.ref('ifBlock');
    const expr = fn.expressionWithMask(node.test);

    // Добавляем блок в родительскую функцию
    fn.mount(t`${v} = new ${internal('IfBlock')}(${fn.argument(ctxArg)}, ${raw(id)}, ${raw(expr.code)});`);
    fn.update(fn.dirtyCheck(expr, t`${v}.render(${raw(expr.code)});`));
    fn.unmount(t`${v}.unmount();`);

    const ifBlock = new TemplateFunction(component, id, [ctxArg, stageArg, refsArgs]);
    for (const child of node.consequent) {
        compileContents(component, child, ifBlock);
    }

    ctx.push(ifBlock.render());
}

/**
 * Компиляция текстового узла
 */
function text(fn: TemplateFunction, node: ENDContent, parent?: TemplateNode | null, parentVar?: TemplateVariable) {
    const expr = fn.expressionWithMask(node);

    if (parentVar && parent?.type === 'ENDElement' && parent.body.length === 1) {
        // Это выражение — единственный потомок элемента, будем его обновлять
        // чуть быстрее
        const update = t`${parentVar}.innerText = ${raw(expr.code)}`;
        fn.mount(t`${update};`);
        if (expr.mask) {
            fn.update(fn.dirtyCheck(expr, t`(${update});`));
        }
    } else if (parentVar && node.type === 'Literal') {
        fn.mount(t`${parentVar}.appendChild(${internal('text')}(${raw(expr.code)}));`);
    } else {
        const v = !parentVar || node.type !== 'Literal'
            ? fn.ref('tx') : fn.id('tx');

        fn.mount(t`${v} = ${internal('text')}(${raw(expr.code)});`);
        if (parentVar) {
            fn.mount(t`${parentVar}.appendChild(${v});`);
        } else {
            fn.mount(t`${internal('attach')}(${v});`);
            fn.unmount(t`${v}.remove();`);
        }

        if (expr.mask) {
            fn.update(fn.dirtyCheck(expr, t`(${v}.nodeValue = ${raw(expr.code)});`));
        }
    }
}