import { html, computed } from './endorphin';

export function IfComponent1({ name, enabled }) {
    const upperName = computed(() => name.toUpperCase());

    return html`<div>
        ${upperName}
        <e:if test=${enabled}>
            <span>Enabled!</span>
        </e:if>
    </div>`;
}
