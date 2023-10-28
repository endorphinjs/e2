import { element, attach, createContext, setupContext, finalizeContext } from 'endorphin/internal';
import { html } from './endorphin';

let outer = 1;
export function MyComponent({ num }) {
    const invalidate = createContext();
    let inner = 1;
    let str = 'a';

    function update() {
        outer += 1; // don’t invalidate: outer scope
        inner++; // don’t invalidate: not used in template
        str = str + 'a'; // don’t invalidate: not used in template
        invalidate(0, num += 2); // invalidate: used in template
    }

    function onMousedown() { inner++ }
    setupContext([num, update, onMousedown], MyComponent_template, 1 /* num */);
    return finalizeContext((nextProps) => { invalidate(0, num = nextProps.num) });
}

function MyComponent_template(ctx, stage, refs) {
    const { scope, dirty } = ctx;
    if (stage === 1) {
        refs.length = 1;
        refs[0] = element("div");
        attach(refs[0]);
        refs[0].innerText = scope[0];
    } else if (stage === 2) {
        (dirty & 1 /* num */) && (refs[0].innerText = scope[0]);
    } else if (stage === 3) {
        refs[0].remove();
    }
}