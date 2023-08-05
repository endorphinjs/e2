import { defineComponent } from '../endorphin';
import { setTargetAfter, type RenderContext, attach } from '../endorphin/internal';
import type { RenderScope, RenderStage } from '../endorphin/types';

interface Props {
    name: string;
}

export default defineComponent(({ name }: Props, { setup, invalidate }) => {
    let enabled = false;

    setup([enabled, name], AnotherComponent_template, 3);
    return {
        toggle() {
            invalidate(0, enabled = !enabled);
        },
        render: () => {}
    };
});

function AnotherComponent_template(ctx: RenderContext, stage: RenderStage, refs: RenderScope) {
    const { scope, dirty } = ctx;
    if (stage === 1) {
        const div1 = document.createElement('div');
        div1.className = 'another-component';
        div1.textContent = 'Enabled: ' + scope[0] /* enabled */ + ', name: ' + scope[1];
        attach(div1);
        setTargetAfter(div1);
        refs.push(div1);
    } else if (stage === 2) {
        (dirty & 3) && (refs[0].textContent = 'Enabled: ' + scope[0] /* enabled */ + ', name: ' + scope[1]);
        setTargetAfter(refs[0]);
    } else if (stage === 3) {
        refs[0].remove();
    }
}