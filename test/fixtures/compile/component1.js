import { createContext, setupContext } from 'endorphin/internal';
import { defineComponent, html } from './endorphin';

let outer = 1;
defineComponent(({ num }) => {
    const invalidate = createContext();
    let inner = 1;
    let str = 'a';

    function update() {
        outer += 1; // don’t invalidate: outer scope
        inner++;
        str = str + 'a'; // don’t invalidate: not used in template
        invalidate(0, num += 2);
    }

    function onMousedown() { inner++ }
    setupContext([num, inner, update, onMousedown], 1 /* num */);
    return html`<div @click=${update} @mousedown=${inner++}>${num}</div>`;
});