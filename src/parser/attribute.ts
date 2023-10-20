import type Scanner from './Scanner';
import type { ENDAttribute, ENDAttributeName, ENDAttributeValue } from './ast';
import { Chars, eatQuoted, isQuote, isSpace, isWhiteSpace, nameChar, nameStartChar } from './utils';

/**
 * Consumes attributes from current stream start
 */
export function parseAttributeList(scanner: Scanner): ENDAttribute[] {
    const attributes: ENDAttribute[] = [];
    let attr: ENDAttribute | undefined;
    while (!scanner.eof()) {
        scanner.eatWhile(isSpace);

        if (attr = parseAttribute(scanner)) {
            attributes.push(attr);
        } else if (!scanner.eof() && !isTerminator(scanner.peek())) {
            throw scanner.error('Unexpected attribute name');
        } else {
            break;
        }
    }

    return attributes;
}

/**
 * Parses attribute from giver scanner
 */
function parseAttribute(scanner: Scanner): ENDAttribute | undefined {
    /*
     * Supported attribute notation:
     * `<div foo bar>`: boolean
     * `<div foo="bar" a=1>`: plain literals
     * `<div foo=${foo + 1}>`: attribute with expression
     * `<div ${foo}>`: attribute shorthand, same as `<div foo=${foo}>`
     * `<div ${{ foo, bar, ...rest }}>`: attribute object literal
     */
    let name: ENDAttributeName | undefined;
    let value: ENDAttributeValue | null = null;
    const start = scanner.getPtr();

    if (name = parseAttributeName(scanner)) {
        if (scanner.eat(Chars.ATTR_DELIMITER)) {
            value = parseAttributeValue(scanner);
            if (!value) {
                throw scanner.error('Expecting attribute value');
            }
        } else {
            // Boolean value: <div foo>
            value = {
                type: 'Literal',
                value: true,
                raw: 'true',
                start: -1,
                end: -1
            };
        }
    } else {
        name = scanner.expression();
        // Check if it’s a shorthand: `<div ${foo}>` => `<div foo=${foo}>`
        if (name?.type === 'Identifier') {
            value = name;
            name = name.name;
        }
    }

    if (name) {
        return {
            type: 'ENDAttribute',
            name,
            value,
            ...scanner.loc(start)
        };
    }
}

/**
 * Returns `true` if valid XML identifier was consumed. If succeeded, sets stream
 * range to consumed data
 */
function parseAttributeName(scanner: Scanner): string | undefined {
    const start = scanner.getPtr();
    if (scanner.eat(attrStartChar)) {
        scanner.start = start;
        scanner.eatWhile(attrChar);

        return scanner.current();
    }
}

/**
 * Consumes attribute value from current scanner location
 */
function parseAttributeValue(scanner: Scanner): ENDAttributeValue | null {
    const expr = scanner.expression();
    if (expr) {
        return expr;
    }

    // TODO доработать парсинг атрибутов https://github.com/endorphinjs/e2/issues/4
    const start = scanner.getPtr();
    if (eatQuoted(scanner) || scanner.eatWhile(isUnquoted)) {
        const raw = scanner.current();
        return {
            type: 'Literal',
            value: castAttributeValue(raw),
            raw,
            ...scanner.loc(start)
        };
    }

    return null;
}

function castAttributeValue(value: string): string | number {
    if (isQuote(value.charCodeAt(0))) {
        return value.slice(1, -1);
    }

    // Cast primitive values
    const num = Number(value);
    if (!isNaN(num)) {
        return num;
    }

    return value;
}

function attrStartChar(ch: number) {
    return ch === Chars.AT || nameStartChar(ch);
}

function attrChar(ch: number) {
    return ch === Chars.PIPE || nameChar(ch);
}

/**
 * Check if given code is tag terminator
 */
function isTerminator(code: number): boolean {
    return code === Chars.TAG_END || code === Chars.TAG_CLOSE;
}

/**
 * Check if given character code is valid unquoted value
 */
function isUnquoted(code: number): boolean {
    return !isNaN(code) && !isQuote(code) && !isWhiteSpace(code)
        && !isTerminator(code) && code !== Chars.ATTR_DELIMITER;
}