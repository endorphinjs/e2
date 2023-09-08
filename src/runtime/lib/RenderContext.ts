import type { Computer, OnRenderCallback, OnUnmountCallback, RenderMask, RenderScope, RenderStage } from '../types';
import { computedValues, getComputed } from './reactive';

type OnRenderListener = [callback: OnRenderCallback, once?: boolean];
type onDestoryListener = OnUnmountCallback;
type ComponentTemplate = (ctx: RenderContext, stage: RenderStage, refs: RenderScope) => void;
type ComputedKey = number | Computer;

const noop = () => {};

/** Защита от потенциальных рекурсивных вызовов `invalidateComputed` */
const computedGuard = new Set<ComputedKey>();

export class RenderContext {
    public scope: RenderScope = [];
    public dirty: RenderMask = 0;
    public template: ComponentTemplate = noop;
    public templateMask: RenderMask = 0;

    private _onRender: OnRenderListener[] = [];
    private _onDestroy: onDestoryListener[] = [];
    private refs: RenderScope | null = null;
    private scheduled = false;
    private rendering = false;

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

    get isMounted() {
        return !!this.refs;
    }

    public markDirty(scopeSlot: number) {
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

    public render() {
        if (this.rendering) {
            return;
        }

        this.rendering = true;
        const stage: RenderStage = this.isMounted ? 2 : 1;
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