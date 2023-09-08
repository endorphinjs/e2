import type { RenderBlock, RenderScope, RenderStage } from '../types';
import type { RenderContext } from './RenderContext';

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