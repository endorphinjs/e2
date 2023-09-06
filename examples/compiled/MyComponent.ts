import { computed, defineComponent, onDestory, onRender } from '../endorphin';
import { attach, setTargetAfter, ForEachBlock, IfBlock, setTargetPrepend, RenderContext, getComputed } from '../endorphin/internal';
import type { RenderScope, RenderStage } from '../endorphin/types';
import AnotherComponent from './AnotherComponent';

// import './style.css';

export interface Props {
    enabled: boolean;
    name: string;
}

let instances = 0;
const items = ['a', 'b', 'c'];

/*
 * Алгоритм преобразования:
 * 1. Собрать все объявленные внутри фабрики переменные, которые используются
 *    в шаблоне. Каждой переменной выделить значение в массиве `ctx` и запомнить
 *    их. Также определить, какие переменные мутируются.
 * 1. Отследить переменные, которые были получены из props, обновлять их в том
 *    числе и на обновление пропсов. Заменить декларацию с `const` на `let`
 * 1. У computed-значений выделяем функцию, которая высчитывает значение,
 *    в отдельную переменную. Дальше будем использовать её для обновления значения
 * 1. У эффектов отдельно собираем используемые переменные, для них собираем
 *    свои маски. Эффекты отдельно обновляем перед рендерингом (отдельный
 *    контракт для Block)
 * 1. Пройтись по массиву переменных — если это сигнал, подписаться на него
 *    с инвалидацией нужной маски
 * 1. Для всех используемых локальных переменных найти мутации и добавить
 *    для них инвалидацию по индексу в `ctx`
 * 1. Для каждой переменной построить граф зависимостей и на изменение значения
 *    инвалидировать
 */

export default defineComponent(({ enabled, name }: Props, ctx) => {
    const { invalidate } = ctx;
    instances++;

    let item: string = '';
    let innerValue = 1;

    // В реальности результат `computed` – это коллбэк, который мы передали.
    // По нему и будем идентифицировать значение.
    // А все обращения к computed-значению заменяем на вызов `getComputed()`
    const fullName = computed(() => enabled ? name : 'Disabled', [0, 1], 4) as unknown as () => string;
    const uppercaseFullName = computed(() => getComputed(fullName).toUpperCase(), [fullName], 5) as unknown as () => string;

    const onItemClick = (item: string) => {
        enabled = invalidate(0, !enabled);
        invalidate(1, name += 'a');
        console.log(getComputed(fullName));

        console.log('Clicked on', item);
        console.log(getComputed(fullName));
    };

    onRender(() => {
        console.log('MyComponent rendered');
    });

    onDestory(() => {
        instances--;
        console.log('MyComponent destroyed')
    });

    // `useComponent` тут не нужен, это подсказка для компилятора
    // useComponent({ AnotherComponent });


    //////////////////
    //// Template ////
    //////////////////

    function onClickhandler1() {
        invalidate(3, innerValue++, innerValue);
    }

    // Фабрика, которая создаёт коллбэки событий внутри цикла
    function createEvent1(item: string) {
        return (evt: Event) => {
            evt.preventDefault();
            onItemClick(item);
        }
    }

    ctx.setup(
        // Значения отсортировать по мутабельности: вначале те, что меняются, чтобы
        // не попасть раньше времени в переполнение битовой маски
        [enabled, name, item, innerValue, fullName, uppercaseFullName, onItemClick, onClickhandler1, createEvent1],
        MyComponent_template,
        1 | 2 | 8 | 16 | 32,
    );

    // ctx.setEffects(dirty => {
    //     (dirty & (1 | 2)) && invalidate(4, fullName = fullName__compute());
    //     // `uppercaseFullName` заависит от `fullName`, но так как `fullName` — это
    //     // computed-свойство, также перечисляем и его зависимости
    //     (dirty & (1 | 2 | 16)) && invalidate(5, uppercaseFullName = uppercaseFullName__compute());
    // }, 1 | 2 | 16);

    return (nextProps: Props) => {
        // Обновляем пропсы
        enabled = invalidate(0, nextProps.enabled);
        name = invalidate(1, nextProps.name);
    };
});

function MyComponent_template(ctx: RenderContext, stage: RenderStage, refs: RenderScope) {
    const { scope, dirty } = ctx;
    if (stage === 1) {
        const div1 = document.createElement('div');
        div1.className = scope[3] /* innerValue */ % 2 ? 'foo' : 'bar';
        div1.classList.toggle('enabled', scope[0] /* enabled */);
        attach(div1);
        setTargetPrepend(div1);
        const if1 = new IfBlock(ctx, MyComponent_if1, scope[0] /* enabled */);
        const ul1 = document.createElement('ul');
        attach(ul1);
        setTargetPrepend(ul1)
        const forEach1 = new ForEachBlock(ctx, MyComponent_forEach1, items);
        refs.push(div1, if1, ul1, forEach1);
    } else if (stage === 2) {
        (dirty & 8) && (refs[0].className = scope[3] /* innerValue */ % 2 ? 'foo' : 'bar');
        (dirty & 1) && refs[0].classList.toggle('enabled', scope[0] /* enabled */);
        setTargetPrepend(refs[0]);
        (dirty & (1 << 0 /* enabled */ | 1 << 3 /* innerValue */ | 1 << 4 /* fullName */ | 1 << 5 /* uppercaseFullName */))
            && refs[1].render(scope[0] /* enabled */);
        setTargetPrepend(refs[2]);
        refs[3].render(items);
    } else if (stage === 3) {
        refs[0].remove();
        refs[1].unmount();
        refs[2].remove();
        refs[3].unmount();
        // TODO возвращать промис, если анимация есть
    }
}


function MyComponent_if1(ctx: RenderContext, stage: RenderStage, refs: RenderScope) {
    const { scope, dirty } = ctx;
    if (stage === 1) {
        // Mount
        const p1 = document.createElement('p');
        p1.setAttribute('title', scope[5]);
        p1.addEventListener('click', scope[7] /* onClickHandler1 */);
        p1.textContent = scope[4] /* fullName */
        attach(p1);
        setTargetAfter(p1);
        const AnotherComponent1 = new AnotherComponent({ name: scope[1] });
        refs.push(p1, AnotherComponent1);
    } else if (stage === 2) {
        (dirty & 32) && refs[0].setAttribute('title', scope[5]);
        (dirty & 16) && (refs[0].textContent = scope[4]);
        setTargetAfter(refs[0]);
        (dirty & 2) && refs[1].update({ name: scope[1] });
    } else if (stage === 3) {
        refs[0].remove();
        refs[1].unmount();
    }
}

function MyComponent_forEach1(ctx: RenderContext, stage: RenderStage, refs: RenderScope, $value: string | undefined, $index: number | undefined) {
    const { scope, dirty } = ctx;
    // Обновляем переменную в скоупе
    scope[2] /* item */ = $value;
    if (stage === 1) {
        const li1 = document.createElement('li');
        li1.className = 'item';
        // XXX сделали отдельную фабрику для создания событий, чтобы у неё был доступ
        // к функции invalidate + правильно скоупили текущее значение
        li1.addEventListener('click', scope[8](scope[2] /* item */));
        li1.textContent = scope[2];
        attach(li1);
        setTargetAfter(li1);
        refs.push(li1);
    } else if (stage === 2) {
        (dirty & 4) && (refs[0].textContent = scope[2]);
        setTargetAfter(refs[0]);
    } else if (stage === 3) {
        refs[0].remove();
    }
}
