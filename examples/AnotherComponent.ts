import { defineComponent, html } from '../src/runtime';

export default defineComponent(() => {
    let enabled = false;
    return {
        toggle() {
            enabled = !enabled;
        },
        update: html`
        <div class="another-component">
            Enabled: ${enabled}
        </div>`
    };
});