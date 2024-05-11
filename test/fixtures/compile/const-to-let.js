import { element, attach, text, createContext, setupContext, finalizeContext } from 'endorphin/internal';
import { html } from './endorphin';

function ConstToLetComponent(props) {
    createContext();
    let { a } = props;
    let b = props.b;

    setupContext([a, b], ConstToLetComponent_template, 3 /* a | b */);
    return finalizeContext((nextProps) => { props = nextProps;invalidate(0, a = nextProps.a);invalidate(1, b = nextProps.b) });
}


function ConstToLetComponent_template(ctx, stage, refs) {
    const { scope, dirty } = ctx;
    if (stage === 1) {
        refs.length = 3;
        refs[0] = element("div");
        attach(refs[0]);
        refs[0].appendChild(text("\n        "));
        refs[1] = text(scope[0]);
        refs[0].appendChild(refs[1]);
        refs[0].appendChild(text("\n        "));
        refs[2] = element("span");
        refs[0].appendChild(refs[2]);
        refs[2].innerText = scope[1];
        refs[0].appendChild(text("\n    "));
    } else if (stage === 2) {
        (dirty & 1 /* a */) && (refs[1].nodeValue = scope[0]);
        (dirty & 2 /* b */) && (refs[2].innerText = scope[1]);
    } else if (stage === 3) {
        refs[0].remove();
    }
}
