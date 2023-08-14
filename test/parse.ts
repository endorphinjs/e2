import { parse } from 'acorn';
import { suite } from 'uvu';
import { equal, ok } from 'uvu/assert';
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

test('Parse Component', () => {
    const t = template('`<AnotherComponent class="a" custom=${custom}></AnotherComponent>`');
    equal(t.body.length, 1);

    const elem = t.body[0] as AST.ENDElement;
    equal(elem.name, 'AnotherComponent');
    ok(elem.component);
    equal(elem.attributes.length, 2);
    equal(pos(elem), { start: 1, end: 46 });
});

test('Parse nearby elements', () => {
    const t = template('`<div /><div />`');
    equal(t.body.length, 2);

    const elem1 = t.body[0] as AST.ENDElement;
    const elem2 = t.body[1] as AST.ENDElement;

    equal(elem1.name, 'div');
    equal(elem1.body.length, 0);
    equal(elem2.name, 'div');
    equal(elem2.body.length, 0);

    equal(pos(elem1), { start: 1, end: 8});
    equal(pos(elem2), { start: 8, end: 15});
});

test('Parse nested elements', () => {
    const t = template('`<div><p /></div>`');
    equal(t.body.length, 1);

    const elem1 = t.body[0] as AST.ENDElement;
    equal(elem1.name, 'div');
    equal(elem1.body.length, 1);
    equal(pos(elem1), { start: 1, end: 6 });

    const elem2 = elem1.body[0] as AST.ENDElement;
    equal(elem2.name, 'p');
    equal(elem2.body.length, 0);
    equal(pos(elem2), { start: 6, end: 11 });
});

test('Parse attributes', () => {
    const t = template('`<div class="a" custom=${b} />`');

    const elem = t.body[0] as AST.ENDElement;
    equal(elem.attributes.length, 2);

    const attr1 = elem.attributes[0] as AST.ENDAttribute;
    equal(attr1.name, 'class');
    equal(pos(attr1), { start: 6, end: 15 });
    const attr1Value = attr1.value as AST.ENDContentMap['Literal'];
    equal(attr1Value.type, 'Literal');
    equal(attr1Value.value, 'a');

    const attr2 = elem.attributes[1] as AST.ENDAttribute;
    equal(attr2.name, 'custom');
    equal(pos(attr2), { start: 16, end: 27 });
    const attr2Value = attr2.value as AST.ENDContentMap['Identifier'];
    equal(attr2Value.type, 'Identifier');
    equal(attr2Value.name, 'b');
});

test('Parse directives', () => {
    const t = template('`<div class:enabled=${content} @click=${() => true} ref=${refId} animate:in="a" />`');

    const elem = t.body[0] as AST.ENDElement;
    equal(elem.directives.length, 3);

    // class
    const dirClass = elem.directives[0] as AST.ENDDirective;
    equal(dirClass.prefix, 'class:');
    equal(dirClass.name, 'enabled');
    equal(pos(dirClass), { start: 6, end: 30 });
    const dirClassValue = dirClass.value as AST.ENDContentMap['Identifier'];
    equal(dirClassValue.type, 'Identifier');
    equal(dirClassValue.name, 'content');

    // @ events
    const dirEvent = elem.directives[1] as AST.ENDDirective;
    equal(dirEvent.prefix, '@');
    equal(dirEvent.name, 'click');
    equal(pos(dirEvent), { start: 31, end: 51 });
    const dirEventValue = dirEvent.value as AST.ENDContentMap['ArrowFunctionExpression'];
    equal(dirEventValue.type, 'ArrowFunctionExpression');
    equal(dirEventValue.params.length, 0);

    // ref
    equal(elem.ref, 'refId'); //TODO: в elem.ref должен быть Identifier

    // animate
    const dirAnimate = elem.directives[2] as AST.ENDDirective;
    equal(dirAnimate.prefix, 'animate:');
    equal(dirAnimate.name, 'in');
    equal(pos(dirAnimate), { start: 65, end: 79 });
    const dirAnimateValue = dirAnimate.value as AST.ENDContentMap['Literal'];
    equal(dirAnimateValue.type, 'Literal');
    equal(dirAnimateValue.value, 'a');
});

test('Parse e:for-each', () => {
    const t = template('`<e:for-each select=${items} as=${item} index=${index}></e:for-each>`');

    const elem = t.body[0] as AST.ENDForEachStatement;
    equal(elem.type, 'ENDForEachStatement');
    equal(elem.valueName, 'item');
    equal(elem.indexName, 'index');
    equal(pos(elem), { start: 1, end: 55 });

    const select = elem.select as AST.ENDContentMap['Identifier'];
    equal(select.type, 'Identifier');
    equal(select.name, 'items');
});

test('Parse e:if', () => {
    const t = template('`<e:if test=${enabled}><div /></e:if>`');

    const elem = t.body[0] as AST.ENDIfStatement;
    equal(elem.type, 'ENDIfStatement');
    equal(elem.consequent.length, 1);
    equal(pos(elem), { start: 1, end: 23 });

    const test = elem.test as AST.ENDContentMap['Identifier'];
    equal(test.type, 'Identifier');
    equal(test.name, 'enabled');
    
    const consequent = elem.consequent[0] as AST.ENDElement;
    equal(consequent.name, 'div');
});

test('Parse e:add-class', () => {
    const t = template('`<e:add-class>__a_${b}</e:add-class>`');

    const elem = t.body[0] as AST.ENDAddClassStatement;
    equal(elem.type, 'ENDAddClassStatement');
    equal(pos(elem), { start: 1, end: 14 });

    equal(elem.tokens.length, 2);
    const token1 = elem.tokens[0] as AST.ENDContentMap['Literal'];
    equal(token1.type, 'Literal');
    equal(token1.value, '__a_');

    const token2 = elem.tokens[1] as AST.ENDContentMap['Identifier'];
    equal(token2.type, 'Identifier');
    equal(token2.name, 'b');
});

test('Parse e:attribute', () => {
    const t = template('`<e:attribute class="a" />`');

    const elem = t.body[0] as AST.ENDAttributeStatement;
    equal(elem.type, 'ENDAttributeStatement');
    equal(pos(elem), { start: 1, end: 26 });
    equal(elem.attributes.length, 1);
});

test('Parse e:choose/when/otherwise', () => {
    const t = template('`<e:choose><e:when test=${enabled}><div /></e:when><e:otherwise><p /></e:otherwise></e:choose>`');

    const choose = t.body[0] as AST.ENDChooseStatement;
    equal(choose.type, 'ENDChooseStatement');
    equal(choose.name, 'e:choose');
    equal(choose.cases.length, 2);

    const when = choose.cases[0] as AST.ENDChooseCase;
    equal(when.type, 'ENDChooseCase');
    const whenTest = when.test as AST.ENDContentMap['Identifier'];
    equal(whenTest.type, 'Identifier');
    equal(whenTest.name, 'enabled');
    equal(when.consequent.length, 1);
    const whencConsequent = when.consequent[0] as AST.ENDElement;
    equal(whencConsequent.name, 'div');

    const otherwise = choose.cases[1] as AST.ENDChooseCase;
    equal(otherwise.type, 'ENDChooseCase');
    ok(!otherwise.test);
    equal(otherwise.consequent.length, 1);
    const otherwiseConsequent = otherwise.consequent[0] as AST.ENDElement;
    equal(otherwiseConsequent.name, 'p');
});

test('Parse ConditionalExpression', () => {
    const t = template('`<div attr=${enabled ? a : b} />`');
    const elem = t.body[0] as AST.ENDElement;

    const attrValue = elem.attributes[0].value as AST.ENDContentMap['ConditionalExpression'];
    equal(attrValue.type, 'ConditionalExpression');
    const test = attrValue.test as AST.ENDContentMap['Identifier'];
    equal(test.type, 'Identifier');
    equal(test.name, 'enabled');
    const consequent = attrValue.consequent as AST.ENDContentMap['Identifier'];
    equal(consequent.type, 'Identifier');
    equal(consequent.name, 'a');
    const alternate = attrValue.alternate as AST.ENDContentMap['Identifier'];
    equal(alternate.type, 'Identifier');
    equal(alternate.name, 'b');
});

test('Parse ArrayExpression', () => {
    const t = template('`<div attr=${[1, a, () => {}]} />`');
    const elem = t.body[0] as AST.ENDElement;

    const attrValue = elem.attributes[0].value as AST.ENDContentMap['ArrayExpression'];
    equal(attrValue.type, 'ArrayExpression');
    equal(attrValue.elements.length, 3);
    const elem1 = attrValue.elements[0] as AST.ENDContentMap['Literal'];
    equal(elem1.type, 'Literal');
    equal(elem1.value, 1);
    const elem2 = attrValue.elements[1] as AST.ENDContentMap['Identifier'];
    equal(elem2.type, 'Identifier');
    equal(elem2.name, 'a');
    const elem3 = attrValue.elements[2] as AST.ENDContentMap['ArrowFunctionExpression'];
    equal(elem3.type, 'ArrowFunctionExpression');
});

test('Parse FunctionExpression', () => {
    const t = template('`<div attr=${function func(a){}} />`');
    const elem = t.body[0] as AST.ENDElement;

    const attrValue = elem.attributes[0].value as AST.ENDContentMap['FunctionExpression'];
    equal(attrValue.type, 'FunctionExpression');
    const id = attrValue.id as AST.ENDContentMap['Identifier'];
    equal(id.type, 'Identifier');
    equal(id.name, 'func');
    equal(attrValue.params.length, 1);
    const param = attrValue.params[0] as AST.ENDContentMap['Identifier'];
    equal(param.type, 'Identifier');
    equal(param.name, 'a');
    ok(attrValue.body);
});

test.run();