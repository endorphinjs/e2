import type { InternalSymbols } from '../Context';

export type Chunk = string | TemplateChunk;
export type TemplateFunctionArg = symbol | string;
export type TemplateSymbol = TemplateArgument | TemplateVariable | TemplateRaw | TemplateInternalSymbol;

export interface TemplateArgument {
    type: 'argument';
    id: string;
}

export interface TemplateVariable {
    type: 'variable';
    id: string;
    index: number;
}

export interface TemplateRaw {
    type: 'raw';
    value: string | number;
}

export interface TemplateInternalSymbol {
    type: 'internal';
    value: InternalSymbols;
}

export interface TemplateChunk {
    type: 'chunk';
    value: Array<string | TemplateSymbol | TemplateChunk | unknown>
}