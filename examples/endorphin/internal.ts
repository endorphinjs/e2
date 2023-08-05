import type { AttachTarget, OnRenderCallback, OnUnmountCallback, RenderBlock, RenderMask, RenderScope, RenderStage } from './types';

type InvalidateHandler = <T>(index: number, value: T, nextValue?: T) => T;
type OnRenderListener = [callback: OnRenderCallback, once?: boolean];
type onDestoryListener = OnUnmountCallback;
type ComponentTemplate = (ctx: RenderContext, stage: RenderStage, refs: RenderScope) => void;
type ContextSetup = (
    scope: RenderScope,
    template: ComponentTemplate,
    templateMask: RenderMask,
    deps?: (dirty: number) => void
) => RenderContext;

interface ForEachHandler<Data> {
    (ctx: RenderContext, state: 3, refs: RenderScope, value?: Data, index?: number): void;
    (ctx: RenderContext, state: RenderStage, refs: RenderScope, value: Data, index: number): void;
}

const enum WhereAttach {
    Append = 0,
    Prepend = 1,
    After = 2
}

const attachTarget: AttachTarget = [document.body, WhereAttach.Append];

export class RenderContext {
    public scope: RenderScope | undefined;
    public dirty: RenderMask = 0;
    public invalidate: InvalidateHandler;
    public setup: ContextSetup;

    private _onRender: OnRenderListener[] = [];
    private _onDestroy: onDestoryListener[] = [];
    private refs: RenderScope | null = null;
    private scheduled = false;
    private rendering = false;
    private template: ComponentTemplate | undefined;
    private templateMask: RenderMask = 0;
    private deps: ((dirty: number) => void) | undefined;

    constructor() {
        this.setup = (scope, template, templateMask, deps) => {
            this.scope = scope;
            this.template = template;
            this.templateMask = templateMask;
            this.deps = deps;
            return this;
        };

        this.invalidate = (index, value, nextValue = value) => {
            // NB: контракт value + nextValue нужен для выражений типа
            // let b = 1;
            // const a = b++;
            // В этом случае b == 2, но а == 1, так как из выражения
            // b++ вернётся предыдущее значение
            const { scope, deps } = this;
            if (scope![index] !== nextValue) {
                scope![index] = nextValue;
                const dirty = 1 << index;
                deps && deps(dirty);
                this.schedule(dirty);
            }
            return value;
        }
    }

    public schedule(dirty: number) {
        // XXX проверить, что тут всё правильно отработает
        if (dirty & this.templateMask) {
            this.dirty |= dirty;
            if (!this.scheduled) {
                this.scheduled = true;
                // Если не случился рендер, то выполним его
                queueMicrotask(() => this.scheduled && this.render());
            }
        }
    }

    public render() {
        if (this.rendering) {
            return;
        }

        this.scheduled = false;
        this.rendering = true;
        const stage: RenderStage = this.refs ? 2 : 1;
        try {
            return this.template(this, stage, this.refs ??= []);
        } finally {
            this.dirty = 0;
            this.rendering = false;

            const listeners = this._onRender;
            const firstRun = stage === 1;
            for (let i = listeners.length - 1; i >= 0; i--) {
                listeners[i][0](firstRun);
                if (listeners[i][0]) {
                    listeners.splice(i, 1);
                }
            }
        }
    }

    public unmount() {
        if (!this.rendering && this.refs) {
            this.scheduled = false;
            this.rendering = true;
            try {
                return this.template(this, 3, this.refs);
            } finally {
                this.rendering = false;
                this.dirty = 0;

                const listeners = this._onDestroy;
                for (let i = listeners.length - 1; i >= 0; i--) {
                    listeners[i]();
                }
            }
        }
    }

    public onRender(listener: OnRenderCallback, once?: boolean) {
        this._onRender.push([listener, once]);
    }

    public onDestroy(listener: OnUnmountCallback) {
        this._onDestroy.push(listener);
    }
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

export class IfBlock implements RenderBlock {
    private refs: RenderScope | null = null;

    constructor(private ctx: RenderContext, public fn: (ctx: RenderContext, stage: RenderStage, refs: RenderScope) => void, test: boolean) {
        this.render(test);
    }

    render(test: boolean): void {
        if (test) {
            this.fn(this.ctx, this.refs ? 2 : 1, this.refs ??= []);
        } else {
            this.unmount();
        }
    }
    unmount(): void {
        if (this.refs) {
            this.fn(this.ctx, 3, this.refs);
            this.refs = null;
        }
    }
}

export class ForEachBlock<Data> {
    private refs: RenderScope[] = [];
    constructor(private ctx: RenderContext, public fn: (ForEachHandler<Data>), items: Data[]) {
        this.render(items);
    }

    public render(items: Data[]) {
        const { ctx, refs, fn } = this;
        let total = 0;

        items.forEach((item, index) => {
            fn(ctx, refs[index] ? 2 : 1, refs[index] ??= [], item, index);
            total++;
        });

        if (total < refs.length) {
            this.unmount(total);
        }
    }

    public unmount(start = 0) {
        for (let i = start; i < this.refs.length; i++) {
            this.fn(this.ctx, 3, this.refs[i]);
        }
        this.refs.length = start;
    }
}