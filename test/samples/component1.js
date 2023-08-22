import { defineComponent, html } from './endorphin';

let outer = 1;
defineComponent(({ num }) => {
    let inner = 1;
    let str = 'a';

    function update() {
        outer += 1; // don’t invalidate: outer scope
        inner++;
        str = str + 'a'; // don’t invalidate: not used in template
        num += 2;
    }

    return html`<div @click=${update} @mousedown=${inner++}>${num}</div>`;
});