import type { AttachTarget } from '../types';
import { RenderContext } from './RenderContext';
import { setTarget } from './dom';

const noop = () => {};

export class Component<Props> {
    public update: (props: Props) => void;

    constructor(private ctx: RenderContext, update?: (props: Props) => void) {
        this.update = update || noop;
    }

    get isMounted() {
        return this.ctx.isMounted;
    }

    mount(target: Element | AttachTarget) {
        const { ctx } = this;
        if (!ctx.isMounted) {
            setTarget(target);
            ctx.render();
        } else {
            console.warn('Component is already mounted');
        }
    }

    unmount() {
        this.ctx.unmount();
    }
}