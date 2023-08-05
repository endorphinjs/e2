import { RenderContext, setTarget } from './internal';
import type { ComponentOptions, IComponentBase, OnRenderCallback, OnUnmountCallback, Render, RenderExtend, RenderResult } from './types';

// Публичный контракт для работы с Endorphin
type ComponentFactory<T> = (props: T, context: RenderContext) => Render<T> | RenderExtend<T>;
type ExtendedProperties<T> = { [P in keyof T]: P extends 'render' ? never : T[P] };

let context: RenderContext | null = null;

export function useComponent(components: { [name: string]: any }) {

}

export function computed<T>(callback: () => T): T {
    return callback();
}

export function html<T = any>(strings: TemplateStringsArray, ...expr: any[]): Render<T> {
    return () => { };
}

const noop = () => {};

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
 * Фабрика для создания компонентов
 */
export function defineComponent<
    P extends {} | undefined,
    R extends RenderResult<P>
>(f: (props: P, context: RenderContext) => R) {
    return class Component extends ComponentBase<P> {
        constructor(props: P, options: ComponentOptions) {
            super(f, props, options);
        }
    } as new (props: P, options?: ComponentOptions) => IComponentBase<P> & ExtendedProperties<R>;
}

class ComponentBase<P extends {} | undefined> implements IComponentBase<P> {
    public props: P;
    private _template: Render<P>;
    private context: RenderContext;

    constructor(f: ComponentFactory<P>, props: P, options?: ComponentOptions) {
        this.props = props;

        const prevContext = context;
        context = this.context = new RenderContext();
        try {
            const result = f(props, context);
            if (typeof result === 'function') {
                this._template = result;
            } else {
                this._template = result.render || noop;
                const descriptors = Object.getOwnPropertyDescriptors(result);
                for (const prop in descriptors) {
                    if (prop !== 'render' && !(prop in this)) {
                        Object.defineProperty(this, prop, descriptors[prop]);
                    }
                }
            }

            if (options?.mount) {
                setTarget(options.mount);
            }

            // Отрисовываем компонент
            context.render();
        } finally {
            context = prevContext;
        }
    }

    update(props: P): void {
        this._template(props);
        this.props = props;
    }

    unmount() {
        this.context.unmount();
        this._template = this.context = this.props = null;
    }
}