import fs from 'node:fs/promises';
import { join } from 'node:path';
import { suite } from 'uvu';
import { equal } from 'uvu/assert';
import { Context, ComponentDeclaration } from '../src/compiler';

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

test.run();