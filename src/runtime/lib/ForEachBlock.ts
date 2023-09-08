import { RenderScope, RenderStage } from '../types';
import { RenderContext } from './RenderContext';

interface ForEachHandler<Data> {
    (ctx: RenderContext, state: 3, refs: RenderScope, value?: Data, index?: number): void;
    (ctx: RenderContext, state: RenderStage, refs: RenderScope, value: Data, index: number): void;
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