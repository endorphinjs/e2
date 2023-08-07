import type { ENDAttribute, ENDDirective, ParsedTag } from './ast';
import type Scanner from './Scanner';
import { ENDSyntaxError } from './Scanner';
import { nameStartChar, nameChar, Chars, prefix } from './utils';
import { parseAttributeList } from './attribute';

const directives = new Set(['@', `${prefix}:`, 'class:', 'animate:']);

/**
 * Consumes tag from current stream location, if possible
 */
export default function parseTag(scanner: Scanner): ParsedTag | undefined {
    return openTag(scanner) || closeTag(scanner);
}

/**
 * Consumes open tag from given stream
 */
export function openTag(scanner: Scanner): ParsedTag | undefined {
    const ptr = scanner.getPtr();
    if (scanner.eat(Chars.TAG_START)) {
        const tagName = parseTagName(scanner);
        if (tagName) {
            const attributes = parseAttributeList(scanner);
            const selfClosing = scanner.eat(Chars.TAG_CLOSE);

            if (!scanner.eat(Chars.TAG_END)) {
                throw scanner.error('Expected tag closing brace');
            }

            scanner.start = ptr;
            const tag = createTag(scanner, tagName, 'open', selfClosing);
            attributes.forEach(attr => {
                const ref = getRef(attr);
                if (ref) {
                    tag.ref = ref;
                    return;
                }

                const directive = getDirective(attr);
                if (directive) {
                    assertDirective(directive);
                    tag.directives.push(directive);
                    return;
                }

                // Validate some edge cases:
                // * Currently, we do not support dynamic names in slots.
                //   Make sure all slot names are literals
                const shouldValidateSlot = attr.name === (tagName === 'slot' ? 'name' : 'slot');

                if (shouldValidateSlot && attr.value?.type !== 'Literal') {
                    throw scanner.error(`Slot name must be a string literal, expressions are not supported`, attr.value);
                }

                tag.attributes.push(attr);
            });

            return tag;
        }
    }

    scanner.ptr = ptr;
}

/**
 * Consumes close tag from given stream
 */
export function closeTag(scanner: Scanner): ParsedTag | undefined {
    const ptr = scanner.ptr;
    if (scanner.eat(Chars.TAG_START) && scanner.eat(Chars.TAG_CLOSE)) {
        const tagName = parseTagName(scanner);
        if (tagName) {
            if (!scanner.eat(Chars.TAG_END)) {
                throw scanner.error('Expected tag closing brace');
            }

            return createTag(scanner, tagName, 'close');
        }

        throw scanner.error('Unexpected character');
    }

    scanner.ptr = ptr;
}

/**
 * Parses tag name from given scanner
 */
function parseTagName(scanner: Scanner): string | undefined {
    const start = scanner.getPtr();
    if (scanner.eat(nameStartChar)) {
        scanner.start = start;
        scanner.eatWhile(nameChar);

        return scanner.current();
    }
}

/**
 * If given attribute is a ref pointer, returns its name
 */
function getRef(attr: ENDAttribute): string | undefined {
    if (attr.name === 'ref') {
        if (!attr.value) {
            throw new ENDSyntaxError(`Expecting "ref" attribute value`, attr);
        }

        if (attr.value.type === 'Identifier') {
            return attr.value.name;
        }

        throw new ENDSyntaxError(`Unexpected "ref" attribute value: it must be an expression with single variable name`, attr);
    }
}

/**
 * If given attribute is a directive (has one of known prefixes), converts it to
 * directive token, returns `null` otherwise
 */
function getDirective(attr: ENDAttribute): ENDDirective | undefined {
    if (typeof attr.name === 'string') {
        const m = attr.name.match(/^@|[\w-]+:/);

        if (m && directives.has(m[0])) {
            let prefix = m[0];
            if (prefix.endsWith(':')) {
                prefix.slice(0, -1);
            }

            return {
                type: 'ENDDirective',
                prefix,
                name: attr.name.slice(m[0].length),
                value: attr.value,
                start: attr.start,
                end: attr.end
            };
        }
    }
}

function createTag(scanner: Scanner,
                   name: string,
                   tagType: 'open' | 'close',
                   selfClosing = false): ParsedTag {
    return {
        type: 'ParsedTag',
        name,
        tagType,
        selfClosing,
        attributes: [],
        directives: [],
        ...scanner.loc()
    };
}

function assertDirective(dir: ENDDirective): void {
    // Make sure event is expression
    if (dir.prefix === '@' && dir.value && dir.value.type === 'Literal') {
        throw new ENDSyntaxError(`Event handler must be expression`, dir.value);
    }
}
