import { defineComponent, html } from './endorphin';

export default defineComponent(() => {
    let enabled = false;
    return {
        toggle() {
            enabled = !enabled;
        },
        render: html`
        <div class="another-component">
            Enabled: ${enabled}
        </div>`
    };
});