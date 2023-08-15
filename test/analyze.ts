import fs from 'node:fs/promises';
import { suite } from 'uvu';
import { equal } from 'uvu/assert';
import { parse } from 'acorn';
import type { Node } from 'estree';
import { findComponentCallbacks, runSymbolAnalysis, Scope } from '../src/compiler/analyze';

const test = suite('Symbol analysis');

function analyze(code: string) {
    const program = parse(code, {
        ecmaVersion: 'latest',
        sourceType: 'module'
    });
    return runSymbolAnalysis(findComponentCallbacks(program as Node)[0]);
}

function keys(scope: Scope, key: 'declarations' | 'usages' | 'updates' | 'dependencies' | 'props'): string[] {
    return Array.from(scope[key].keys());
}

test('Simple variable reference', () => {
    const { scope } = analyze(`
    defineComponent(props => {
        const { enabled, name } = props;
        const obj = { a: 1 };
        let b = 2;
        function onClick(event) {
            b++;
            console.log(obj.a, b);
        }
    });`);

    equal(keys(scope, 'declarations'), ['props', 'enabled', 'name', 'obj', 'b', 'onClick'])
    equal(keys(scope, 'updates'), ['b']);
    equal(keys(scope, 'usages'), ['props', 'console', 'obj', 'b']);
});

test('Object accessor reference', () => {
    const { scope } = analyze(`
    defineComponent(({ enabled, name }) => {
        const obj = {
            a1: {
                a2: { a3: 1 }
            }
        };
        const key = 'A3';
        obj.a1.a2.b2 = 1;
        obj.a1.a2[key.toLowerCase()] = 10;
        obj.a1.a2[key.toLowerCase()]++;
    });`);

    equal(keys(scope, 'declarations'), ['enabled', 'name', 'obj', 'key'])
    equal(keys(scope, 'updates'), ['obj']);
    equal(keys(scope, 'usages'), ['key']);
});

test('Computed refs', () => {
    const { scope } = analyze(`
    defineComponent(({ enabled, name }) => {
        const a = 'hello';
        const b = 1;
        const c = 2;
        const d = computed(() => a.toUpperCase() + b);
    });`);

    equal(keys(scope, 'dependencies'), ['d']);
    equal(scope.dependencies.get('d'), new Set(['a', 'b']));
});

test('Template variables', async () => {
    const file = await fs.readFile('./test/samples/MyComponent.js', 'utf8');
    const { scope, templateScope } = analyze(file);
    if (!templateScope) {
        throw new Error('No template scope');
    }
    equal(keys(templateScope, 'usages'), ['innerValue', 'enabled', 'uppercaseFullName', 'fullName', 'name', 'items', 'item', 'onItemClick']);
    equal(keys(templateScope, 'updates'), ['innerValue']);

    equal(keys(scope, 'dependencies'), ['fullName', 'uppercaseFullName']);
    equal(scope.dependencies.get('fullName'), new Set(['enabled', 'name']));
    equal(scope.dependencies.get('uppercaseFullName'), new Set(['fullName']));
});

test('Declare props as argument', () => {
    const { scope } = analyze(`
    defineComponent(({ enabled, name }) => {
        const b = 1;
    });`);
    equal(keys(scope, 'props'), ['enabled', 'name']);
});

test('Declare props in factory', () => {
    const { scope } = analyze(`
    defineComponent(props => {
        const { foo: foo1, bar } = props;
        const foo2 = props.foo;
        const b = 1;
    });`);
    equal(keys(scope, 'props'), ['props', 'foo1', 'bar', 'foo2']);
});

test.run();