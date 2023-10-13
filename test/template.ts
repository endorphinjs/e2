import { suite } from 'uvu';
import { Context, ComponentDeclaration } from '../src/compiler';
import compileTemplate from '../src/compiler/template';

function compile(code: string) {
    const ctx = new Context(code);
    const component = ctx.getComponents()[0];
    const decl = new ComponentDeclaration(ctx, component);
    compileTemplate(decl);
    return ctx.render();
}

const test = suite('Template compiler');

test.skip('Element with attributes', () => {
    console.log(compile(`
        const outer = 1;
        function MyComponent({ prop1 }) {
            let inner = 2;
            return html\`<div data-outer=\${outer} data-inner=\${outer + inner} title=\${'Title is ' + prop1.toLowerCase()}></div>\`;
        }
    `));
});

test.run();
