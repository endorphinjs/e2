export type Data = Record<string, any>;
export type AttachTarget = [elem: Element, where: number];
export type RenderStage = 1 | 2 | 3;

export type Render<T> = (data: T) => void;
export type RenderExtend<T> = { render: Render<T>, [key: string]: unknown };
export type RenderResult<P> = Render<P> | RenderExtend<P>;
export type RenderScope = any[];
export type RenderMask = number;

export interface RenderBlock {
    render(...args: any[]): void
    unmount(): void
}

export type OnRenderCallback = (firstRun?: boolean) => void;
export type OnUnmountCallback = () => void;

export interface IComponentBase<P> {
    props: P;
    update(props: P): void;
    unmount(): void;
};

export interface ComponentOptions {
    // Точка монтирования компонента
    mount: Element | AttachTarget;
}

export type Computer<T = any> = () => T;