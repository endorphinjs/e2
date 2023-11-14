import fs from 'node:fs/promises';
import { join } from 'node:path';
import { suite } from 'uvu';
import { equal, ok } from 'uvu/assert';
import { Context, ComponentDeclaration, EndorphinContext } from '../src/compiler';

function read(file: string) {
    return fs.readFile(join('./test', file), 'utf8');
}

function same(a: string, b: string) {
    return equal(a.trim(), b.trim());
}

const test = suite('Component compiler');

test('component1.js', async () => {
    const file = await read('./samples/component1.js');
    const ctx = new Context(file);
    const component = ctx.getComponents()[0];
    const decl = new ComponentDeclaration(ctx, component);
    decl.compile(ctx.patcher);

    same(ctx.render(), await read('./fixtures/compile/component1.js'));
});

test('computed1.js', async () => {
    const file = await read('./samples/computed1.js');
    const ctx = new Context(file);
    const component = ctx.getComponents()[0];
    const decl = new ComponentDeclaration(ctx, component);
    decl.compile(ctx.patcher);

    same(ctx.render(), await read('./fixtures/compile/computed1.js'));
});

test('if1.js', async () => {
    const file = await read('./samples/if1.js');
    const ctx = new Context(file);
    const component = ctx.getComponents()[0];
    const decl = new ComponentDeclaration(ctx, component);
    decl.compile(ctx.patcher);

    same(ctx.render(), await read('./fixtures/compile/if1.js'));
});

// Проверка извлечения символов из импортов
test('Extract symbols from import declarations', async () => {
    const fileContent = `
        import { defineComponent, html } from 'endorphin';
        import { someSymbol } from 'some-module';

        export default defineComponent(() => {
            return html\`<div>...</div>\`;
        });
    `;

    const ctx = new Context(fileContent);
    const endorphinContext = new EndorphinContext(ctx.ast);

    ok(endorphinContext.isComponentSymbol('defineComponent'));
    ok(endorphinContext.isComponentSymbol('html'));
    ok(endorphinContext.isComponentSymbol('someSymbol'));
});

// Проверка извлечения символов из переименованных импортов
test('Extract symbols from renamed import declarations', async () => {
    const fileContent = `
        import { defineComponent as def, html as h } from 'endorphin';

        export default def(() => {
            return h\`<div>...</div>\`;
        });
    `;

    const ctx = new Context(fileContent);
    const endorphinContext = new EndorphinContext(ctx.ast);

    ok(endorphinContext.isComponentSymbol('def'));
    ok(endorphinContext.isComponentSymbol('h'));
    ok(!endorphinContext.isComponentSymbol('defineComponent'));
    ok(!endorphinContext.isComponentSymbol('html'));
});

// Проверка извлечения символов из нестандартных импортов
test('Extract symbols from non-standard import declarations', async () => {
    const fileContent = `
        import { customComponent, customHTML } from 'custom-module';

        export default customComponent(() => {
            return customHTML\`<div>...</div>\`;
        });
    `;

    const ctx = new Context(fileContent);
    const endorphinContext = new EndorphinContext(ctx.ast);

    ok(endorphinContext.isComponentSymbol('customComponent'));
    ok(endorphinContext.isComponentSymbol('customHTML'));
});

// Проверка извлечения символов из нескольких импортов
test('Extract symbols from multiple import declarations', async () => {
    const fileContent = `
        import { a, b, c } from 'module1';
        import { x, y, z } from 'module2';

        export default a(() => {
            return b\`<div>...</div>\`;
        });
    `;

    const ctx = new Context(fileContent);
    const endorphinContext = new EndorphinContext(ctx.ast);

    ok(endorphinContext.isComponentSymbol('a'));
    ok(endorphinContext.isComponentSymbol('b'));
    ok(endorphinContext.isComponentSymbol('c'));
    ok(endorphinContext.isComponentSymbol('x'));
    ok(endorphinContext.isComponentSymbol('y'));
    ok(endorphinContext.isComponentSymbol('z'));
});

test.run();