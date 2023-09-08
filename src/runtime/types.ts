export type Data = Record<string, any>;
export type AttachTarget = [elem: Element, where: number];
export type RenderStage = 1 | 2 | 3;

export type Render<T> = (data: T) => void;
export type RenderExtend<T> = { update: Render<T>, [key: string]: unknown };
export type RenderResult<P> = Render<P> | RenderExtend<P>;
export type RenderScope = any[];
export type RenderMask = number;

export interface RenderBlock {
    render(...args: any[]): void
    unmount(): void
}

export type OnRenderCallback = (firstRun?: boolean) => void;
export type OnUnmountCallback = () => void;

export type Component<Props, Extend extends RenderResult<Props> = (props: Props) => void> = IComponentBase<Props> & Extend;
export interface IComponentBase<P> {
    readonly isMounted: boolean;
    update(props: P): void;
    mount(target: Element | AttachTarget): void;
    unmount(): void;
};

export type Computer<T = any> = () => T;
export type ComputedKey = number | Computer;