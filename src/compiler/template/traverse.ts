import type { Node } from 'estree';
import { traverse as _traverse, VisitorOption, type Controller, type Visitor } from 'estraverse';
import { ENDStatement, ENDTemplate } from '../../parser/ast';
export type TemplateNode = ENDStatement | ENDTemplate;

interface TemplateVisitor {
    enter?: ((this: Controller, node: TemplateNode, parent: TemplateNode | null) => VisitorOption | TemplateNode | void) | undefined;
    leave?: ((this: Controller, node: TemplateNode, parent: TemplateNode | null) => VisitorOption | TemplateNode | void) | undefined;
}

const keys = {
    ENDTemplate: ['body'],
    ENDElement: ['body'],
    ENDIfStatement: ['consequent'],
    ENDChooseStatement: ['cases'],
    ENDChooseCase: ['consequent'],
    ENDForEachStatement: ['body']
}

export default function traverseTemplate(root: TemplateNode, visitor: TemplateVisitor) {
    return _traverse(root as Node, {
        ...visitor,
        keys
    } as Visitor);
}