import fs from 'node:fs/promises';
import { suite } from 'uvu';
// import { equal, ok } from 'uvu/assert';
import { Context, ComponentDeclaration } from '../src/compiler';

const test = suite('Component compiler');

test.only('component1.js', async () => {
    const file = await fs.readFile('./test/samples/component1.js', 'utf8');
    const ctx = new Context(file);
    const component = ctx.getComponents()[0];
    const decl = new ComponentDeclaration(ctx, component);
    decl.applyPatches(ctx.patcher);

    // console.log(ctx.patcher.render());
});

test.run();