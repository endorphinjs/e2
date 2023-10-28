import { Component } from './lib/Component';
import { RenderContext } from './lib/RenderContext';
import type { Render, RenderMask, RenderResult, RenderScope, RenderStage } from './types';

export { IfBlock } from './lib/IfBlock';
export { ForEachBlock } from './lib/ForEachBlock';
export * from './lib/dom';

type InvalidateHandler = <T>(index: number, value: T, nextValue?: T) => T;
type ComponentTemplate = (ctx: RenderContext, stage: RenderStage, refs: RenderScope) => void;

/** Контекст текущего компонента */
export let context: RenderContext | null = null;
const contextStack: Array<RenderContext | null> = [];

/**
 * Создаёт контекст отрисовки компонента
 */
export function createContext(): InvalidateHandler {
    contextStack.push(context);
    const ctx = context = new RenderContext();
    const { scope } = ctx;

    return (index, value, nextValue = value) => {
        // NB: контракт value + nextValue нужен для выражений типа
        // let b = 1;
        // const a = b++;
        // В этом случае b == 2, но а == 1, так как из выражения
        // b++ вернётся предыдущее значение
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

export function finalizeContext<P, R extends RenderResult<P>>(mixin: R): Component<P> & R {
    const update = (typeof mixin === 'function' ? mixin : mixin.update) as Render<P>;
    const component = new Component(context!, update);
    context = contextStack.pop() || null;

    if (typeof mixin !== 'function') {
        const descriptors = Object.getOwnPropertyDescriptors(mixin);
        for (const prop in descriptors) {
            if (!(prop in component)) {
                Object.defineProperty(component, prop, descriptors[prop]);
            }
        }
    }

    return component as Component<P> & R;
}

export function text(value: any) {
    return document.createTextNode(value);
}