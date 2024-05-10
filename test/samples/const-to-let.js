import { html } from './endorphin';

function ConstToLetComponent(props) {
    const { a } = props;
    const b = props.b;

    return html`<div>
        ${a}
        <span> ${b}</span>
    </div>`;
}
