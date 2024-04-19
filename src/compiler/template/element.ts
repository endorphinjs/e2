import type { ENDElement } from '../../parser/ast';
import NodeTreeLookup from './NodeTreeLookup';
import type TemplateFunction from './TemplateFunction';
import type { TemplateVariable } from './types';
import { internal, isTemplateNode, raw, t } from './utils';

/**
 * Компиляция DOM-элемента: генерирует код, необходимый для создания, обновления
 * и удаления указанного элемента
 */
export default function compileElement(fn: TemplateFunction, elem: ENDElement, lookup: NodeTreeLookup): TemplateVariable {
    const parent = lookup.getParentVar(elem);
    const v = !parent || requiresUpdate(elem)
        ? fn.ref(elem.name) : fn.id(elem.name);

    fn.mount(t`${v} = ${internal('element')}(${elem.name});`);
    if (parent) {
        fn.mount(t`${parent}.appendChild(${v});`);
    } else {
        fn.mount(t`${internal('attach')}(${v});`);
        fn.unmount(t`${v}.remove();`);
    }

    for (const attr of elem.attributes) {
        if (!attr.value) {
            // Булевой атрибут, нужно только создать его
            fn.mount(t`${internal('attribute')}(${v}, ${attr.name}, '');`);
        } else if (attr.value.type === 'Literal') {
            // Статический атрибут
            const { value } = attr.value;
            if (value !== false && value !== undefined && value !== null) {
                fn.mount(t`${internal('attribute')}(${v}, ${attr.name}, ${value});`);
            }
        } else {
            const expr = fn.expressionWithMask(attr.value);
            const updateCode = t`${internal('attribute')}(${v}, ${attr.name}, ${raw(expr.code)});`;
            fn.mount(updateCode);
            if (expr.mask) {
                fn.update(fn.dirtyCheck(expr, updateCode));
            }
        }
    }

    return v;
}

/**
 * Вернёт `true` если элемент как-то надо обновлять между рендерами
 */
function requiresUpdate(elem: ENDElement) {
    for (const attr of elem.attributes) {
        if (attr.value && attr.value.type !== 'Literal') {
            return true;
        }
    }

    // Частный случай: содержимым элемента является выражение
    if (elem.body.length === 1) {
        const child = elem.body[0]!;
        return child.type !== 'Literal' && !isTemplateNode(child);
    }
}