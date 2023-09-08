import { RenderContext } from './lib/RenderContext';
import type { AttachTarget, Component, RenderMask, RenderResult, RenderScope, RenderStage } from './types';

export { IfBlock } from './lib/IfBlock';
export { ForEachBlock } from './lib/ForEachBlock';

type InvalidateHandler = <T>(index: number, value: T, nextValue?: T) => T;
type ComponentTemplate = (ctx: RenderContext, stage: RenderStage, refs: RenderScope) => void;

const enum WhereAttach {
    Append = 0,
    Prepend = 1,
    After = 2
}

/** Текущая точка монтирования */
const attachTarget: AttachTarget = [document.body, WhereAttach.Append];

/** Контекст текущего компонента */
export let context: RenderContext | null = null;
const contextStack: Array<RenderContext | null> = [];

/**
 * Создаёт контекст отрисовки компонента
 */
export function createContext(): InvalidateHandler {
    contextStack.push(context);
    const ctx = context = new RenderContext();

    return (index, value, nextValue = value) => {
        // NB: контракт value + nextValue нужен для выражений типа
        // let b = 1;
        // const a = b++;
        // В этом случае b == 2, но а == 1, так как из выражения
        // b++ вернётся предыдущее значение
        const { scope } = ctx;
        if (scope![index] !== nextValue) {
            scope![index] = nextValue;
            ctx.invalidateComputed(index);
            ctx.markDirty(index);
        }
        return value;
    };
}

export function setupContext(scope: RenderScope, template: ComponentTemplate, templateMask: RenderMask) {
    if (context) {
        context.scope = scope;
        context.template = template;
        context.templateMask = templateMask;
    } else {
        console.warn('Unable to setup context outside of component scope');
    }
}

export function finalizeContext<P, R extends RenderResult<P>>(mixin: R): Component<P, R> {
    const ctx = context!;
    context = contextStack.pop() || null;

    const component = {
        // XXX вывести ctx для отладки?
        get isMounted() {
            return ctx.isMounted;
        },
        update: typeof mixin === 'function' ? mixin : mixin.update,
        mount(target) {
            if (!ctx.isMounted) {
                setTarget(target);
                ctx.render();
            } else {
                console.warn('Component is already mounted');
            }
        },
        unmount() {
            ctx.unmount();
        }
    } as Component<P, R>;

    if (typeof mixin !== 'function') {
        const descriptors = Object.getOwnPropertyDescriptors(mixin);
        for (const prop in descriptors) {
            if (!(prop in component)) {
                Object.defineProperty(component, prop, descriptors[prop]);
            }
        }
    }

    return component;
}

export function attach(elem: Element) {
    const [target, where] = attachTarget;
    if (where === WhereAttach.Append) {
        target.append(elem);
    } if (where === WhereAttach.Prepend) {
        target.prepend(elem);
    } else {
        target.after(elem);
    }
}

export function setTargetAfter(elem: Element) {
    attachTarget[0] = elem;
    attachTarget[1] = WhereAttach.After;
}

export function setTargetPrepend(elem: Element) {
    attachTarget[0] = elem;
    attachTarget[1] = WhereAttach.Prepend;
}

export function setTarget(target: Element | AttachTarget) {
    if (Array.isArray(target)) {
        attachTarget[0] = target[0];
        attachTarget[1] = target[1];
    } else {
        setTargetPrepend(target);
    }
}
