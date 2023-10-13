import type { Identifier, Function, Node } from 'estree';
import type ComponentDeclaration from '../ComponentDeclaration';
import type Scope from '../Scope';
import Patcher from '../Patcher';
import logger from '../logger';
import { isFunctionDeclaration } from '../analyze';
import { capitalize } from '../../shared/utils';
import type { ENDDirective } from '../../parser/ast';

/**
 * Поддерживаемые модификаторы событий
 */
const supportedModifiers = new Set(['stop', 'stopPropagation', 'prevent', 'preventDefault', 'passive']);

export interface CompiledEventHandler {
    node: Identifier;
    code: string;
}

/**
 * Компилирует обработчик событий при необходимости и возвращает код для него.
 * Обработчик компилируется только если он является выражением либо содержит
 * модификаторы в самом событии. Если обработчик скомпилировался, в самой
 * директиве будет он будет заменён на новый AST-узел.
 */
export default function compileEventHandler(component: ComponentDeclaration, handler: ENDDirective): CompiledEventHandler | undefined {
    const { name, modifiers } = parseEvent(handler);
    const { value } = handler;
    const isIdHandler = value?.type === 'Identifier';
    let mod = eventModifiers(modifiers);

    if (!value || (!mod && isIdHandler)) {
        // Ничего не надо делать, можно указать переданный указатель как
        // хэндлер события:
        // <div @click={onClick}>
        return;
    }

    let eventHandlerSymbol = '';
    const patcher = new Patcher(component.ctx.code, value);
    const patchInvalidate = (map: Map<string, Node[]>) => {
        map.forEach((nodes, symbol) => {
            if (component.scope.declarations.has(symbol)) {
                for (const n of nodes) {
                    if (n.start >= value.start && n.end <= value.end) {
                        component.patchInvalidate(patcher, symbol, n);
                    }
                }
            }
        });
    };

    if (isFunctionDeclaration(value)) {
        // Указали коллбэк в качестве хэндлера:
        // <div @click={() => i++}>
        const scope = component.fnScopes.get(value);

        if (!scope) {
            logger.error('Unknown scope for handler', value);
            return;
        }

        // Уже указали функцию, нужно её вынести из шаблона и добавить
        // модификаторы. Если функция анонимная, дать ей имя
        if ('id' in value && value.id) {
            eventHandlerSymbol = value.id.name;
        } else {
            eventHandlerSymbol = component.scope.id(`on${capitalize(name)}`);
            patcher.prepend(value.start, `const ${eventHandlerSymbol} = `);
        }

        if (mod) {
            // Определяем название аргумента c событием
            const eventSymbol = getEventSymbol(value, scope, patcher);
            if (eventSymbol) {
                if (value.body.type === 'BlockStatement') {
                    // Тело функции завёрнуто в {...}, добавляем модификаторы внутрь
                    patcher.append(value.body.start + 1, mod(eventSymbol));
                } else {
                    // Тело без скобок, просто выражение
                    patcher.wrap(value.body, `{ ${mod(eventSymbol)} return `, ' }');
                }
            }
        }

        // Патчим нужные обновления в обработчике
        patchInvalidate(scope.updates);
    } else {
        // Записали выражение, нужно превратить его в функцию:
        // <div @click={i++}>
        eventHandlerSymbol = component.scope.id(`on${capitalize(name)}`);

        const eventSymbol = isIdHandler || mod ? component.scope.id('event') : '';
        const modStr = mod ? mod(eventSymbol) : '';
        const suffix = isIdHandler ? `(${eventSymbol})` : '';

        patcher.wrap(value, `function ${eventHandlerSymbol}(${eventSymbol}) { ${modStr}`, `${suffix} }`);

        // Патчим нужные обновления в выражении
        patchInvalidate(component.scope.updates);
    }

    if (eventHandlerSymbol) {
        return {
            node: {
                type: 'Identifier',
                name: eventHandlerSymbol,
                start: value.start,
                end: value.end
            },
            code: patcher.render()
        };
    }
}

/**
 * Парсит данные о событии и его модификаторов из названия атрибута
 */
function parseEvent(dir: ENDDirective) {
    const sep = '|';
    const [name, ...modifiersList] = dir.name.split(sep);
    const modifiers = new Set<string>();
    let offset = dir.prefix.length + name.length + sep.length;
    for (const m of modifiersList) {
        if (supportedModifiers.has(m)) {
            modifiers.add(m);
        } else {
            logger.warn(`Unknown event modifier "${m}"`, [offset, offset + m.length]);
        }
    }

    return { name, modifiers };
}

function eventModifiers(modifiers: Set<string>): ((name: string) => string) | undefined {
    let result = '';
    if (modifiers.has('stop') || modifiers.has('stopPropagation')) {
        result += `EVENT.stopPropagation();`;
    }

    if (modifiers.has('prevent') || modifiers.has('preventDefault')) {
        result += `EVENT.preventDefault();`;
    }

    if (result) {
        return name => result.replace(/EVENT/g, name);
    }
}

/**
 * Возвращает символ для аргумента с объектом события для указанного хэндлера:
 * либо достаёт его как первый аргумент функции, либо создаёт и дописывает в патчер
 */
function getEventSymbol(handler: Function, scope: Scope, patcher: Patcher): string | undefined {
    const firstArg = handler.params[0];

    if (!firstArg) {
        // На случай если внутри коллбэка уже будет своя переменная `event`,
        // воспользуемся скоупом функции, чтобы выделить отдельную переменную
        const eventSymbol = scope.id('event');
        const pos = patcher.code.slice(handler.start, handler.end).indexOf('(');
        if (pos !== -1) {
            patcher.prepend(handler.start + pos, eventSymbol);
        } else {
            logger.warn('Invalid event declaration', handler);
        }

        return eventSymbol;
    }

    if (firstArg.type === 'Identifier') {
        return firstArg.name;
    }

    logger.warn('Unexpected argument type', firstArg);
}