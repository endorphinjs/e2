import type { BaseNode, Identifier, Literal, Node } from 'estree';
import type Scanner from './Scanner';
import type * as AST from './ast';
import { ENDSyntaxError } from './Scanner';

const cdataOpen = toCharCodes('<![CDATA[');
const cdataClose = toCharCodes(']]>');
const commentOpen = toCharCodes('<!--');
const commentClose = toCharCodes('-->');
const piOpen = toCharCodes('<?');
const piClose = toCharCodes('?>');

/**
 * A prefix for Endorphin element and attribute names
 */
export const prefix = 'e';
const nsPrefix = prefix + ':';

export const Chars = {
    /** `'` */
    SINGLE_QUOTE: 39,
    /** `"` */
    DOUBLE_QUOTE: 34,
    /** `\` */
    ESCAPE: 92,
    /** `_` */
    UNDERSCORE: 95,
    /** `:` */
    NAMESPACE_DELIMITER: 58,
    /** `-` */
    DASH: 45,
    /** `<` */
    TAG_START: 60,
    /** `>` */
    TAG_END: 62,
    /** `/` */
    TAG_CLOSE: 47,
    /** `=` */
    ATTR_DELIMITER: 61,
    /** `.` */
    DOT: 46,
    /** `@` */
    AT: 64,
    /** `|` */
    PIPE: 124,
} as const;

const contentTypes = new Set<keyof AST.ENDContentMap>([
    'ArrayExpression', 'ArrowFunctionExpression', 'AssignmentExpression', 'BinaryExpression',
    'CallExpression', 'ChainExpression', 'ConditionalExpression', 'FunctionExpression',
    'Identifier', 'Literal', 'LogicalExpression', 'MemberExpression', 'NewExpression',
    'ObjectExpression', 'SequenceExpression', 'TaggedTemplateExpression', 'TemplateLiteral',
    'UnaryExpression', 'UpdateExpression'
]);

const elementTypes = new Set<keyof AST.ENDElementStatementMap>([
    'ENDAddClassStatement',  'ENDAttributeStatement', 'ENDChooseCase', 'ENDChooseStatement',
    'ENDElement', 'ENDForEachStatement', 'ENDIfStatement'
]);

/**
 * Check if given character can be used as a start of tag name or attribute
 */
export function nameStartChar(ch: number): boolean {
    return isAlpha(ch)
        || ch === Chars.UNDERSCORE
        || ch === Chars.NAMESPACE_DELIMITER;
}

/**
 * Check if given character can be used as a tag name
 */
export function nameChar(ch: number): boolean {
    return nameStartChar(ch)
        || isNumber(ch)
        || ch === Chars.DASH
        || ch === Chars.DOT;
}

/**
 * Check if given node is `Identifier`
 */
export function isIdentifier(node?: Node): node is Identifier {
    return node?.type === 'Identifier';
}

/**
 * Check if given node is `Literal`
 */
export function isLiteral(node?: Node): node is Literal {
    return node?.type === 'Literal';
}

/**
 * Consumes section from given string which starts with `open` character codes
 * and ends with `close` character codes
 * @param allowUnclosed Allow omitted `close` part in text stream
 */
export function eatSection(scanner: Scanner, open: number[], close: number[], allowUnclosed = false): boolean {
    const start = scanner.getPtr();

    if (scanner.eatArray(open)) {
        scanner.start = start;

        // Read next until we find ending part or reach the end of input
        while (!scanner.eof()) {
            if (scanner.eatArray(close)) {
                return true;
            }

            scanner.expression() || scanner.next();
        }

        if (allowUnclosed) {
            // unclosed section is allowed
            return true;
        } else {
            throw scanner.error(`Expected ${close.map(ch => String.fromCharCode(ch)).join('')}`);
        }
    }

    return false;
}

/**
 * Converts given string into array of character codes
 */
export function toCharCodes(str: string): number[] {
    return str.split('').map(ch => ch.charCodeAt(0)!);
}

/**
 * Consumes 'single' or "double"-quoted string from given string, if possible
 */
export function eatQuoted(scanner: Scanner): boolean {
    const start = scanner.getPtr();
    const quote = scanner.peek();

    if (scanner.eat(isQuote)) {
        while (!scanner.eof()) {
            switch (scanner.next()) {
                case quote:
                    scanner.start = start;
                    return true;

                case Chars.ESCAPE:
                    scanner.next();
                    break;
            }
        }

        throw scanner.error('Missing closing quote for string', start);
    }

    return false;
}

/**
 * Eats paired characters substring, for example `(foo)` or `[bar]`
 * @param scanner
 * @param open Character code of pair opening
 * @param close Character code of pair closing
 */
export function eatPair(scanner: Scanner, open: number, close: number): boolean {
    const start = scanner.getPtr();

    if (scanner.eat(open)) {
        let stack = 1;
        let ch: number;

        while (!scanner.eof()) {
            if (eatQuoted(scanner)) {
                continue;
            }

            ch = scanner.next();
            if (ch === open) {
                stack++;
            } else if (ch === close) {
                stack--;
                if (!stack) {
                    scanner.start = start;
                    return true;
                }
            } else if (ch === Chars.ESCAPE) {
                scanner.next();
            }
        }

        throw scanner.error(`Unable to find matching pair for ${String.fromCharCode(open)}`);
    }

    return false;
}

/**
 * Check if given character code is a quote
 */
export function isQuote(code: number): boolean {
    return code === Chars.SINGLE_QUOTE || code === Chars.DOUBLE_QUOTE;
}

/**
 * Check if given code is a number
 */
export function isNumber(code: number): boolean {
    return code > 47 && code < 58;
}

/**
 * Check if given character code is alpha code (letter through A to Z)
 */
export function isAlpha(code: number, from = 65, to = 90): boolean {
    code &= ~32; // quick hack to convert any char code to uppercase char code
    return code >= from && code <= to;
}

/**
 * Check if given character code is alpha-numeric (letter through A to Z or number)
 */
export function isAlphaNumeric(code: number): boolean {
    return isNumber(code) || isAlpha(code);
}

/**
 * Check if given character code is a whitespace character
 */
export function isWhiteSpace(code: number): boolean {
    return code === 32   /* space */
        || code === 9    /* tab */
        || code === 160; /* non-breaking space */
}

/**
 * Check if given character code is a space character
 */
export function isSpace(code: number): boolean {
    return isWhiteSpace(code)
        || code === 10  /* LF */
        || code === 13; /* CR */
}

/**
 * Check if given AST node is a supported content expression
 */
export function isContentExpression(expr: BaseNode): expr is AST.ENDContent {
    return contentTypes.has(expr.type as keyof AST.ENDContentMap);
}

/**
 * Check if given AST node is a supported element or statement
 */
export function isElementNode(node: BaseNode): node is AST.ENDElementStatement {
    return elementTypes.has(node.type as keyof AST.ENDElementStatementMap);
}

export function isFormattingLiteral(node: Literal): boolean {
    if (typeof node.value === 'string') {
        return /^\s+$/.test(node.value) && !/[\r\n]/.test(node.value);
    }

    return false;
}

/**
 * Consumes XML sections that can be safely ignored by Endorphin
 */
export function ignored(scanner: Scanner, space?: boolean): boolean {
    return eatSection(scanner, cdataOpen, cdataClose)
        || eatSection(scanner, piOpen, piClose)
        || eatSection(scanner, commentOpen, commentClose, true)
        || (space ? scanner.eatWhile(isSpace) : false);
}

/**
 * Returns control statement name from given tag name if possible
 * @param name Tag name
 */
export function getControlName(name: string): string {
    if (name.startsWith(nsPrefix)) {
        return name.slice(nsPrefix.length);
    }
    return '';
}

/**
 * Returns attribute with given name from tag name definition, if any
 */
export function getAttribute(elem: AST.ParsedTag | AST.ENDElement | AST.ENDAttributeStatement, name: string): AST.ENDAttribute | undefined {
    return elem.attributes.find(attr => attr.name === name);
}

/**
 * Returns directive with given prefix and name from tag name definition, if any
 */
export function getDirective(tag: AST.ParsedTag, dirPrefix: string, name?: string): AST.ENDDirective | undefined {
    return tag.directives.find(dir => dir.prefix === dirPrefix && (!name || dir.name === name));
}

/**
 * Check if `tag` element contains attribute with given name and returns it. If not,
 * throws exception
 */
export function expectAttribute(tag: AST.ParsedTag, name: string): AST.ENDAttribute {
    const attr = getAttribute(tag, name);
    if (!attr) {
        throw new ENDSyntaxError(`Expecting "${name}" attribute in <${tag.name}> element`, tag);
    }

    return attr;
}

/**
 * Check if given attribute has value
 */
export function assertValue(attr: AST.ENDAttribute): AST.ENDContent {
    if (!attr.value) {
        const attrName = typeof attr.name === 'string' ? attr.name : '';
        throw new ENDSyntaxError(`Expecting string literal as${attrName ? ` "${attrName}"` : ''} attribute value`, attr);
    }

    return attr.value!;
}

/**
 * Check if value of given attribute is an expression. If not, throws exception
 */
export function assertExpressionValue(attr: AST.ENDAttribute | AST.ENDDirective): AST.ENDContent {
    if (!attr.value || attr.value.type === 'Literal') {
        let attrName = '';
        if (attr.type === 'ENDDirective') {
            attrName = `${attr.prefix}:${attr.name}`;
        } else if (typeof attr.name === 'string') {
            attrName = attr.name;
        }

        throw new ENDSyntaxError(`Expecting expression as${attrName ? ` "${attrName}"` : ''} attribute value`, attr);
    }

    return attr.value;
}

/**
 * Check if value of given attribute is a literal. If not, throws exception
 */
export function assertLiteralValue(attr: AST.ENDAttribute): Literal {
    if (attr.value && attr.value.type !== 'Literal') {
        const attrName = typeof attr.name === 'string' ? attr.name : '';
        throw new ENDSyntaxError(`Expecting string literal as${attrName ? ` "${attrName}"` : ''} attribute value`, attr);
    }

    return attr.value!;
}

/**
 * Check if value of given attribute is a literal. If not, throws exception
 */
export function assertIdentifierValue(attr: AST.ENDAttribute): Identifier {
    if (!attr.value || attr.value.type !== 'Identifier') {
        const attrName = typeof attr.name === 'string' ? attr.name : '';
        throw new ENDSyntaxError(`Expecting variable identifier as${attrName ? ` "${attrName}"` : ''} attribute value`, attr);
    }

    return attr.value!;
}