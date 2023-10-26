import type { ENDStatement, ENDTemplateNode } from '../../parser/ast';
import type { TemplateArgument, TemplateChunk, TemplateInternalSymbol, TemplateRaw, TemplateSymbol, TemplateVariable } from './types';

const templateNodeTypes: Set<string> = new Set([
    'ENDElement', 'ENDAttributeStatement', 'ENDAddClassStatement',
    'ENDIfStatement', 'ENDChooseStatement', 'ENDForEachStatement',
] satisfies Array<ENDTemplateNode['type']>);

/**
 * Тэг для template literal, с помощью которого удобно собирать строки для рендеринга
 * функций
 */
export function t(strings: TemplateStringsArray, ...expr: any[]): TemplateChunk {
    const result: TemplateChunk = {
        type: 'chunk',
        value: []
    };
    for (let i = 0; i < strings.length; i++) {
        result.value.push(strings[i]);
        if (i < expr.length) {
            const e = expr[i];
            if (isTemplateSymbol(e) || isTemplateChunk(e)) {
                result.value.push(e);
            } else {
                result.value.push(JSON.stringify(e));
            }
        }
    }

    return result;
}

export function variable(id: string, index = -1): TemplateVariable {
    return { type: 'variable', id, index };
}

export function argument(id: string): TemplateArgument {
    return { type: 'argument', id };
}

export function raw(value: TemplateRaw['value']): TemplateRaw {
    return { type: 'raw', value };
}

export function internal(value: TemplateInternalSymbol['value']): TemplateInternalSymbol {
    return { type: 'internal', value };
}

export function isTemplateSymbol(value: any): value is TemplateSymbol {
    return value && typeof value === 'object' ? 'type' in value : false;
}

export function isTemplateNode(node: ENDStatement): node is ENDTemplateNode {
    return templateNodeTypes.has(node.type);
}

export function isTemplateChunk(value: any): value is TemplateChunk {
    return value ? typeof value === 'object' && 'type' in value && value.type === 'chunk' : false;
}