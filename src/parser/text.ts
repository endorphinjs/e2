import type { Literal } from 'estree';
import type Scanner from './Scanner';
import { Chars, nameStartChar } from './utils';
import { ScannerPtr } from './Scanner';

/**
 * Consumes text token from given stream
 */
export default function text(scanner: Scanner): Literal | undefined {
    const start = scanner.getPtr();
    while (!scanner.eof() && !isTextBound(scanner)) {
        scanner.next();
    }

    if (!eq(start, scanner.ptr)) {
        scanner.start = start;
        return {
            type: 'Literal',
            value: scanner.current(),
            ...scanner.loc(start)
        };
    }
}

/**
 * Check if given stream is at tag start
 */
function isTextBound(scanner: Scanner): boolean {
    if (!scanner.hasNext()) {
        return true;
    }
    const ch = scanner.peek();

    // At tag start or just a lone `<` character?
    if (ch === Chars.TAG_START) {
        const ch2 = scanner.peek(1);
        return nameStartChar(ch2)
            || ch2 === Chars.TAG_CLOSE
            || ch2 === 33 /* ! */
            || ch2 === 63; /* ? */
    }

    return false;
}

function eq(p1: ScannerPtr, p2: ScannerPtr): boolean {
    return p1.pos === p2.pos && p1.index === p2.index;
}