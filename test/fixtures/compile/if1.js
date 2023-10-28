import { getComputed, text, attach, element, IfBlock, createContext, setupContext, finalizeContext } from 'endorphin/internal';
import { html, computed } from './endorphin';

export function IfComponent1({ name, enabled }) {
    createContext();
    const upperName = computed(() => name.toUpperCase(), [2], 0);

    setupContext([upperName, enabled, name], IfComponent1_template, 3 /* upperName | enabled */);
    return finalizeContext((nextProps) => { invalidate(2, name = nextProps.name);invalidate(1, enabled = nextProps.enabled) });
}


function IfComponent1_if(ctx, stage, refs) {
    if (stage === 1) {
        refs.length = 3;
        refs[0] = text("\n            ");
        attach(refs[0]);
        refs[1] = element("span");
        attach(refs[1]);
        refs[1].innerText = "Enabled!";
        refs[2] = text("\n        ");
        attach(refs[2]);
    } else if (stage === 3) {
        refs[0].remove();
        refs[1].remove();
        refs[2].remove();
    }
}


function IfComponent1_template(ctx, stage, refs) {
    const { scope, dirty } = ctx;
    if (stage === 1) {
        refs.length = 3;
        refs[0] = element("div");
        attach(refs[0]);
        refs[0].appendChild(text("\n        "));
        refs[1] = text(getComputed(scope[0]));
        refs[0].appendChild(refs[1]);
        refs[0].appendChild(text("\n        "));
        refs[2] = new IfBlock(ctx, IfComponent1_if, scope[1]);
        refs[0].appendChild(text("\n    "));
    } else if (stage === 2) {
        (dirty & 1 /* upperName */) && (refs[1].nodeValue = getComputed(scope[0]));
        (dirty & 2 /* enabled */) && refs[2].render(scope[1]);
    } else if (stage === 3) {
        refs[0].remove();
        refs[2].unmount();
    }
}