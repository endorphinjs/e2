import type { RenderContext } from './lib/RenderContext';
import type { Component, Computer, OnRenderCallback, OnUnmountCallback, Render, RenderResult } from './types';

let context: RenderContext | null = null;

export function useComponent(components: { [name: string]: any }) {

}

export function computed<T>(callback: () => T, deps?: Array<number | Computer>, slot?: number): T {
    if (context) {
        return context.setComputed(callback, deps, slot) as T;
    }
    console.warn(`"computed" should be called in context of component to be reactive`);
    return callback();
}

export function html<T = any>(strings: TemplateStringsArray, ...expr: any[]): Render<T> {
    return () => { };
}

export function onRender(callback: OnRenderCallback, once?: boolean) {
    if (context) {
        context.onRender(callback, once);
    } else {
        console.warn('No context');
    }
}

export function onDestory(callback: OnUnmountCallback) {
    if (context) {
        context.onDestroy(callback);
    } else {
        console.warn('No context');
    }
}

/**
 * Вспомогательная функция для типизации фабрики компонента
 */
export function defineComponent<Props, R extends RenderResult<Props>>(factory: (props: Props) => R) {
    return factory as (props: Props) => Component<Props, R>;
}
