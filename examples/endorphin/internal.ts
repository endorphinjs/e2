import type { AttachTarget, Computer, OnRenderCallback, OnUnmountCallback, RenderBlock, RenderMask, RenderScope, RenderStage } from './types';

type InvalidateHandler = <T>(index: number, value: T, nextValue?: T) => T;
type OnRenderListener = [callback: OnRenderCallback, once?: boolean];
type onDestoryListener = OnUnmountCallback;
type ComponentTemplate = (ctx: RenderContext, stage: RenderStage, refs: RenderScope) => void;
type ComputedKey = number | Computer;

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
const noop = () => {};

/** Глобальное хранилище computed-значений */
export const computedValues = new Map<Computer, any>();

/** Защита от потенциальных рекурсивных вызовов `invalidateComputed` */
const computedGuard = new Set<ComputedKey>();

export function getComputed<T = any>(computer: Computer<T>): T {
    if (computedValues.has(computer)) {
        return computedValues.get(computer);
    }

    const value = computer();
    computedValues.set(computer, value);
    return value;
}

export class RenderContext {
    public scope: RenderScope;
    public invalidate: InvalidateHandler;

    private _onRender: OnRenderListener[] = [];
    private _onDestroy: onDestoryListener[] = [];
    private refs: RenderScope | null = null;
    private scheduled = false;
    private rendering = false;

    public dirty: RenderMask = 0;
    private template: ComponentTemplate = noop;
    private templateMask: RenderMask = 0;

    /**
     * Зависимости для computed-значений. В качестве ключа указывается индекс
     * слота данных в `scope` либо computed-примитив. Значение — список
     * computed-примитивов, которые зависят от ключа
     */
    private computedDeps = new Map<ComputedKey, Computer | Computer[]>();

    /**
     * Указатели на места в `scope`, где хранится computed-значение.
     * В том числе используется для хранения всех computed-примитивов, используемых
     * в компоненте
     */
    private computedSlots = new Map<Computer, number | undefined>();

    private runScheduled = () => {
        this.scheduled = false;
        if (this.dirty & this.templateMask) {
            this.render();
        }
    };

    constructor() {
        this.invalidate = (index, value, nextValue = value) => {
            // NB: контракт value + nextValue нужен для выражений типа
            // let b = 1;
            // const a = b++;
            // В этом случае b == 2, но а == 1, так как из выражения
            // b++ вернётся предыдущее значение
            const { scope } = this;
            if (scope![index] !== nextValue) {
                scope![index] = nextValue;
                this.invalidateComputed(index);
                this.markDirty(index);
            }
            return value;
        }
    }

    private markDirty(scopeSlot: number) {
        this.dirty |= 1 << scopeSlot;
        // XXX проверить, что тут всё правильно отработает
        if (!this.scheduled) {
            this.scheduled = true;
            queueMicrotask(this.runScheduled);
        }
    }

    public setComputed(computer: Computer, deps?: ComputedKey[], slot?: number): Computer {
        this.computedSlots.set(computer, slot);
        if (deps) {
            // Распределяем зависимости: от каких элементов зависит наш computed.
            // При изменении любого из указанных элементов computed будет
            // инвалидироваться
            const { computedDeps } = this;
            for (let i = 0, dep: ComputedKey; i < deps.length; i++) {
                dep = deps[i];
                const entry = computedDeps.get(dep);
                if (!entry) {
                    computedDeps.set(dep, computer);
                } else if (Array.isArray(entry)) {
                    entry.push(computer);
                } else {
                    computedDeps.set(dep, [entry, computer]);
                }
            }
        }
        return computer;
    }

    public invalidateComputed(key: ComputedKey) {
        try {
            this._invalidateComputed(key);
        } finally {
            computedGuard.clear();
        }
    }

    private _invalidateComputed(key: ComputedKey) {
        if (computedGuard.has(key)) {
            return;
        }

        computedGuard.add(key);

        if (typeof key === 'function') {
            computedValues.delete(key);
            const slot = this.computedSlots.get(key);
            if (slot !== undefined) {
                this.markDirty(slot);
            }
        }

        const refs = this.computedDeps.get(key);
        if (Array.isArray(refs)) {
            for (let i = 0; i < refs.length; i++) {
                this._invalidateComputed(refs[i]);
            }
        } else if (refs) {
            this._invalidateComputed(refs);
        }
    }

    public setup(scope: RenderScope, template: ComponentTemplate, templateMask: RenderMask) {
        this.scope = scope;
        this.template = template;
        this.templateMask = templateMask;
    }

    public render() {
        if (this.rendering) {
            return;
        }

        this.rendering = true;
        const stage: RenderStage = this.refs ? 2 : 1;
        try {
            // Обновляем computed-значения
            this.computedSlots.forEach((slot, computer) => {
                if (slot !== undefined) {
                    this.scope[slot] = getComputed(computer);
                }
            });

            // TODO flush watch effects
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
                this.refs = null;
                this.computedSlots.forEach((_, computer) => computedValues.delete(computer));
                this.computedSlots.clear();
                this.computedDeps.clear();

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