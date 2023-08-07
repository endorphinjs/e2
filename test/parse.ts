import { parse } from 'acorn';
import { suite } from 'uvu';
import { equal } from 'uvu/assert';
import parseTemplate, { type AST } from '../src/parser';

const template = (code: string) => {
    const ast = parse(code, { ecmaVersion: 'latest', sourceType: 'module' }) as any;
    return parseTemplate(ast.body[0].expression);
};

const pos = (node: AST.ENDNode) => ({ start: node.start, end: node.end });

const test = suite('Template parser');

test('Parse element', () => {
    const t = template('`<div class="a" enabled=${enabled}></div>`');
    equal(t.body.length, 1);

    const elem = t.body[0] as AST.ENDElement;
    equal(elem.name, 'div');
    equal(elem.attributes.length, 2);
    equal(pos(elem), { start: 1, end: 35 });
});

test.run();