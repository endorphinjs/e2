import { html } from './endorphin';

let outer = 1;
export function MyComponent({ num }) {
    let inner = 1;
    let str = 'a';

    function update() {
        outer += 1; // don’t invalidate: outer scope
        inner++; // don’t invalidate: not used in template
        str = str + 'a'; // don’t invalidate: not used in template
        num += 2; // invalidate: used in template
    }

    return html`<div @click=${update} @mousedown=${inner++}>${num}</div>`;
}