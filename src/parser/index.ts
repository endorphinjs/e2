import type { TemplateLiteral } from 'estree';
import type * as AST from './ast';
import Scanner, { ENDSyntaxError } from './Scanner';
import tag from './tag';
import text from './text';
import {
    prefix, ignored, getControlName, assertExpressionValue, expectAttribute,
    assertValue, getAttribute, assertIdentifierValue, isElementNode,
    isFormattingLiteral, getDirective
} from './utils';

type TemplateElement = AST.ENDTemplate | AST.ENDElementStatement;
type TemplateContent = AST.ENDElementStatement | AST.ENDContent;

export type { AST };

const statementFactory = {
    'attribute': attributeStatement,
    'attr': attributeStatement,
    'add-class': addClassStatement,
    'if': ifStatement,
    'choose': chooseStatement,
    'when': caseStatement,
    'otherwise': caseStatement,
    'switch': chooseStatement,
    'case': caseStatement,
    'default': caseStatement,
    'for-each': forEachStatement,
} as const;

/**
 * Parses given Endorphin template text into AST
 * @param code Template source
 */
export default function parse(code: TemplateLiteral): AST.ENDTemplate {
    const scanner = new Scanner(code);
    const stack = new TemplateStack(code);
    let entry: AST.ParsedTag | AST.ENDStatement | undefined;

    while (!scanner.eof()) {
        if (entry = scanner.expression()) {
            stack.push(entry);
        } else if (entry = text(scanner)) {
            // Skip formatting tokens: a whitespace-only text token with new lines
            if (!isFormattingLiteral(entry)) {
                stack.push(entry);
            }
        } else if (entry = tag(scanner)) {
            stack.push(entry);
        } else if (!ignored(scanner)) {
            throw scanner.error('Unexpected token');
        }
    }

    return stack.root;
}

class TemplateStack {
    public root: AST.ENDTemplate;
    private stack: TemplateElement[];
    private ptr: TemplateElement;

    constructor(code: TemplateLiteral) {
        this.root = {
            type: 'ENDTemplate',
            body: [],
            start: code.start,
            end: code.end
        };
        this.stack = [this.root];
        this.ptr = this.root;
    }

    push(node: AST.ParsedTag | AST.ENDContent) {
        if (node.type === 'ParsedTag') {
            if (node.tagType === 'open') {
                let ifElem: AST.ENDIfStatement | undefined;

                // Check if open tag contains `if` directive. If so, wrap output into
                // `<if>` statement and remove directives
                const ifAttr = getDirective(node, prefix, 'if');
                if (ifAttr) {
                    ifElem = ifStatementFromDirective(ifAttr);
                    node = {
                        ...node,
                        directives: node.directives.filter(d => d !== ifAttr)
                    };
                }

                const controlName = getControlName(node.name) as keyof typeof statementFactory;
                const elem = controlName in statementFactory
                    ? statementFactory[controlName](node)
                    : elementStatement(node);

                if (ifElem) {
                    appendChild(this.ptr, ifElem);
                    appendChild(ifElem, elem);
                } else {
                    appendChild(this.ptr, elem);
                }

                if (!node.selfClosing) {
                    this.stack.push(elem as TemplateElement);
                    this.ptr = elem as TemplateElement;
                }
            } else {
                // Closing tag
                this.stack.pop();
                const prev = this.stack[this.stack.length - 1];
                if (!prev) {
                    throw new ENDSyntaxError(`Unexpected close tag </${node.name}>`, node);
                }
                this.ptr = prev;
            }
        } else {
            appendChild(this.ptr, node);
        }
    }
}

function attributeStatement(tag: AST.ParsedTag): AST.ENDAttributeStatement {
    return {
        type: 'ENDAttributeStatement',
        attributes: tag.attributes,
        directives: tag.directives,
        start: tag.start,
        end: tag.end
    };
}

function elementStatement(tag: AST.ParsedTag): AST.ENDStatement {
    for (const directive of tag.directives) {
        if (directive.prefix === 'class' && directive.value !== null) {
            assertExpressionValue(directive);
        }
    }

    return {
        type: 'ENDElement',
        name: tag.name,
        // TODO check if element is a component
        component: tag.name.includes('-') || /^[A-Z]/.test(tag.name),
        ref: tag.ref,
        attributes: tag.attributes,
        directives: tag.directives,
        body: [],
        start: tag.start,
        end: tag.end
    };
}
function ifStatement(tag: AST.ParsedTag): AST.ENDIfStatement {
    const test = expectAttribute(tag, 'test');

    return {
        type: 'ENDIfStatement',
        test: assertValue(test),
        consequent: [],
        start: tag.start,
        end: tag.end
    };
}

function ifStatementFromDirective(directive: AST.ENDDirective): AST.ENDIfStatement {
    assertExpressionValue(directive);

    return {
        type: 'ENDIfStatement',
        test: directive.value!,
        consequent: [],
        start: directive.start,
        end: directive.end
    };
}

function chooseStatement(tag: AST.ParsedTag): AST.ENDChooseStatement {
    return {
        type: 'ENDChooseStatement',
        name: tag.name as AST.ENDChooseStatement['name'],
        cases: [],
        start: tag.start,
        end: tag.end
    };
}

function caseStatement(tag: AST.ParsedTag): AST.ENDChooseCase {
    const tagName = getControlName(tag.name);
    const test = getAttribute(tag, 'test');
    if (test) {
        if (tagName === 'otherwise' || tagName === 'default') {
            throw new ENDSyntaxError(`Unexpected "test" attribute in <${tag.name}> element`, tag);
        }
    } else if (tagName === 'switch' || tagName === 'case') {
        throw new ENDSyntaxError(`Expecting "test" attribute in <${tag.name}> element`, tag);
    }

    return {
        type: 'ENDChooseCase',
        test: test ? assertExpressionValue(test) : null,
        consequent: [],
        start: tag.start,
        end: tag.end
    };
}

function forEachStatement(tag: AST.ParsedTag): AST.ENDForEachStatement {
    const select = expectAttribute(tag, 'select');
    const key = getAttribute(tag, 'key');
    const value = getAttribute(tag, 'as');
    const index = getAttribute(tag, 'index');

    return {
        type: 'ENDForEachStatement',
        select: assertValue(select),
        key: key ? assertExpressionValue(key) : undefined,
        body: [],
        indexName: index ? assertIdentifierValue(index).name : '',
        valueName: value ? assertIdentifierValue(value).name : '',
        keyName: '',
        start: tag.start,
        end: tag.end
    };
}

function addClassStatement(tag: AST.ParsedTag): AST.ENDAddClassStatement {
    return {
        type: 'ENDAddClassStatement',
        tokens: [],
        start: tag.start,
        end: tag.end
    };
}

function appendChild(parent: TemplateElement, child: AST.ENDElementStatement | AST.ENDContent) {
    switch (parent.type) {
        case 'ENDAddClassStatement':
            if (isElementNode(child)) {
                throw new ENDSyntaxError('Nested elements are not allowed in `add-class` statement', child);
            }
            parent.tokens.push(child);
            break;

        case 'ENDAttributeStatement':
            // ignore
            break;

        case 'ENDChooseStatement': {
            const chooseName = parent.name === 'switch' ? 'case' : 'when';
            const fallbackName = parent.name === 'switch' ? 'default' : 'otherwise';

            if (child.type !== 'ENDChooseCase') {
                throw new ENDSyntaxError(`Unexpected content in \`${parent.name}\` statement: only ${chooseName} and ${fallbackName} are allowed`, child);
            }

            const lastItem = parent.cases[parent.cases.length - 1];
            if (lastItem && !lastItem.test) {
                throw new ENDSyntaxError(`No more statements are allowed after terminating \`${fallbackName}\` in \`${parent.name}\` statement`, child);
            }

            parent.cases.push(child);
            break;
        }

        case 'ENDChooseCase':
        case 'ENDIfStatement':
            if (assertAllowedContent(child)) {
                parent.consequent.push(child);
            }
            break;

        default:
            if (assertAllowedContent(child)) {
                parent.body.push(child);
            }
    }
}

function assertAllowedContent(node: AST.ENDElementStatement | AST.ENDContent): node is Exclude<TemplateContent, AST.ENDChooseCase> {
    if (node.type === 'ENDChooseCase') {
        throw new ENDSyntaxError('Unexpected `choose` statement outside `switch` element');
    }

    return true;
}
