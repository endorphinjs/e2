/// <reference types="estree" />

declare module "estree" {
    export interface BaseNode {
        start: number;
        end: number;
    }
}

import type * as ESTree from 'estree';

// Endorphin template AST
export type ENDNode = ESTree.BaseNode;

export type ENDStatement = ENDElement | ENDContent | ENDAttributeStatement | ENDAddClassStatement | ENDControlStatement;
export type ENDControlStatement = ENDIfStatement | ENDChooseStatement | ENDForEachStatement;
export type ENDAttributeName = string | ENDContent;
export type ENDAttributeValue = ENDContent | null;

export interface ENDContentMap {
    ArrayExpression: ESTree.ArrayExpression;
    ArrowFunctionExpression: ESTree.ArrowFunctionExpression;
    AssignmentExpression: ESTree.AssignmentExpression;
    BinaryExpression: ESTree.BinaryExpression;
    CallExpression: ESTree.CallExpression;
    ChainExpression: ESTree.ChainExpression;
    ConditionalExpression: ESTree.ConditionalExpression;
    FunctionExpression: ESTree.FunctionExpression;
    Identifier: ESTree.Identifier;
    Literal: ESTree.Literal;
    LogicalExpression: ESTree.LogicalExpression;
    MemberExpression: ESTree.MemberExpression;
    NewExpression: ESTree.NewExpression;
    ObjectExpression: ESTree.ObjectExpression;
    SequenceExpression: ESTree.SequenceExpression;
    TaggedTemplateExpression: ESTree.TaggedTemplateExpression;
    TemplateLiteral: ESTree.TemplateLiteral;
    UnaryExpression: ESTree.UnaryExpression;
    UpdateExpression: ESTree.UpdateExpression;
}

export interface ENDElementStatementMap {
    ENDElement: ENDElement;
    ENDAttributeStatement: ENDAttributeStatement;
    ENDAddClassStatement: ENDAddClassStatement
    ENDIfStatement: ENDIfStatement;
    ENDChooseStatement: ENDChooseStatement;
    ENDChooseCase: ENDChooseCase;
    ENDForEachStatement: ENDForEachStatement;
}

export type ENDContent = ENDContentMap[keyof ENDContentMap];
export type ENDElementStatement = ENDElementStatementMap[keyof ENDElementStatementMap];

export interface ENDTemplate extends ENDNode {
    type: 'ENDTemplate';
    body: ENDStatement[];
    /** All event handlers defined in template */
    events: EventHandlerData[];
}

export interface ENDElement extends ENDNode {
    type: 'ENDElement';
    name: string;
    ref?: string;
    component: boolean;
    attributes: ENDAttribute[];
    directives: ENDDirective[];
    body: ENDStatement[];
}

export interface ENDAttribute extends ENDNode {
    type: 'ENDAttribute';
    name: ENDAttributeName;
    value: ENDAttributeValue;
}

export interface ENDDirective extends ENDNode {
    type: 'ENDDirective';
    prefix: string;
    name: string;
    value: ENDAttributeValue;
}

export interface ENDIfStatement extends ENDNode {
    type: 'ENDIfStatement';
    consequent: ENDStatement[];
    test: ENDContent;
}

export interface ENDChooseStatement extends ENDNode {
    type: 'ENDChooseStatement';
    name: 'choose' | 'switch';
    cases: ENDChooseCase[];
}

export interface ENDChooseCase extends ENDNode {
    type: 'ENDChooseCase';
    test: ENDContent | null;
    consequent: ENDStatement[];
}

export interface ENDForEachStatement extends ENDNode {
    type: 'ENDForEachStatement';
    body: ENDStatement[];
    select: ENDContent;
    key?: ENDContent;
    /** Name of local variable for referencing iterator index */
    indexName: string;
    /** Name of local variable for referencing iterator key */
    keyName: string;
    /** Name of local variable for referencing iterator value */
    valueName: string;
}
export interface ENDAttributeStatement extends ENDNode {
    type: 'ENDAttributeStatement';
    attributes: ENDAttribute[];
    directives: ENDDirective[];
}

export interface ENDAddClassStatement extends ENDNode {
    type: 'ENDAddClassStatement';
    tokens: ENDContent[];
}

export interface ParsedTag extends ENDNode {
    type: 'ParsedTag';
    name: string;
    ref?: string;
    attributes: ENDAttribute[];
    directives: ENDDirective[];
    tagType: 'open' | 'close';
    selfClosing?: boolean;
}

export interface EventHandlerData {
    /** Event handler pointer */
    handler: ENDDirective;
    /** Element containing event handler */
    element: ENDElement;
    /**
     * Private scope symbols for event handler: runtime variables from template
     * blocks. For example `as` attribute identifier from `<for-each>` statement
     */
    privateScope: Set<string>;
}