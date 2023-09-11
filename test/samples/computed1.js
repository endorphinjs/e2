import { html, computed } from './endorphin';

export function Computed1({ firstName, lastName }) {
    const fullName = computed(() => `${firstName} ${lastName}`);
    const upperFullname = computed(() => fullName.toUpperCase());

    function onClick() {
        firstName += '1';
        console.log(fullName);
    }

    return html`<div @click=${onClick}>${upperFullname}</div>`;
}
