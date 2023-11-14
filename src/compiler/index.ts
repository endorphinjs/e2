import Context from './Context';

export { default as Scope } from './Scope';
export { default as ComponentDeclaration } from './ComponentDeclaration';
export { default as EndorphinContext } from './EndorphinContext';
export { Context };

/**
 * Компилирует указанный JS-файл: находит все модули и преобразует их
 * в самостоятельный JS
 */
export function compile(file: string): string {
    const ctx = new Context(file);
    return ctx.compile();
}