import { element, attach, createContext, setupContext, getComputed } from 'endorphin/internal';
import { html, computed } from './endorphin';

export function Computed1({ firstName, lastName }) {
    const invalidate = createContext();
    const fullName = computed(() => `${firstName} ${lastName}`, [2, 3]);
    const upperFullname = computed(() => getComputed(fullName).toUpperCase(), [fullName], 1);

    function onClick() {
        invalidate(2, firstName += '1');
        console.log(getComputed(fullName));
    }

    setupContext([onClick, upperFullname, firstName, lastName], Computed1_template, 2 /* upperFullname */);
    return html`<div @click=${onClick}>${upperFullname}</div>`;
}


function Computed1_template(ctx, stage, refs) {
    if (stage === 1) {
        refs.length = 1;
        refs[0] = element("div");
        attach(refs[0]);
    } else if (stage === 3) {
        refs[0].remove();
    }
}