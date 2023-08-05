# Прототип Endorphin2 (WIP)

Основные принципы будущего решения:
* Точкой входа в компонент является JS-файл.
* Поддержка реактивных примитивов (см. [Vue](https://vuejs.org/guide/essentials/reactivity-fundamentals.html) или [@preact/signals](https://preactjs.com/guide/v10/signals/).

Из главных изменений (по сравнению с текущей версией Endorphin):
* Шаблон указывается внутри фабрики компонента с помощью Tagged Templates. Это решает сразу несколько проблем: бесплатно получаем валидацию, type checking и автокомплит данных, а также используем готовые плагины типа [Lit](https://marketplace.visualstudio.com/items?itemName=runem.lit-plugin) для подсветки синтаксиса внутри такой строки.
* Локальные переменные, объявленные внутри фабрики компонента, автоматически становятся реактивными. То есть вместо `const enabled = ref(false)` как во Vue можно писать `let enabled = false` и компилятор автоматически сделает из него реактивное значение.

## Пример описания компонента

```ts
import { defineComponent, html, computed, useComponent, onDestory } from 'endorphin';
import AnotherComponent from './AnotherComponent.ts';

// Импорт стилей компонента. Стили так же автоматически преобразуются и скоупятся
import './style.css';

export interface Props {
    enabled: boolean;
    name: string;
}

// Общая переменная модуля, как в обычном JS
let instances = 0;
const items = ['a', 'b', 'c'];

// Объявляем компонент через вызов `defineComponent()`.
// Вернётся класс, который в любом месте можно создать так:
// import MyComponent from './component.ts';
// const c = new MyComponent(props);
export default defineComponent(({ enabled, name }: Props) => {
    // Вызов текущей функции работает как `willMount()` из предыдущей
    // версии эндорфина

    // Свободно обращаемся к общим переменным модуля
    instances++;

    // Локальные переменные, которые буду использоваться в шаблоне,
    // объявляем в JS: получим бесплатную типизацию из JS/TS
    let item: string;
    let innerValue = 1;

    // Объявляем реактивныем переменные: они будут автоматически пересчитываться,
    // когда поменяется любое значение внутри коллбэка
    const fullName = computed(() => enabled ? name : 'Disabled');

    const onItemClick = (item: string) => {
        console.log('Clicked on', item);
    };

    // Добавление методов жизненного цикла будет работать через вызов
    // функции модуля
    onDestory(() => {
        instances--;
        console.log('component destroyed')
    });

    // Тут самое неприятное место — необходимо явно зарегистрировать использование
    // вложенных компонентов в формате `{имяКомпонента: класс}`, чтобы не было
    // не использованных переменных и чтобы компилятор знал, как связывать имя
    // элемента с конструктором компонента
    useComponent({ AnotherComponent });

    // Шаблон указываем через tagged template literal.
    // Это даёт следующее:
    // * нативная валидация, code check и выведение типов, так как тут пишем
    //   обычный JS
    // * в этом месте подключается компилятор, который заменяет вызов `html`
    //   на скомпилированную функцию рендеринга
    // * все переменные, которые используются внутри tagged template, автоматически
    //   становятся реактивными: их изменение приводит к ре-рендеру шаблона
    // * можно использовать плагин для Lit, который подсветит HTML внутри такой строки
    return html`<div class="${innerValue ? 'foo' : 'bar'}"
                     class:enabled=${enabled}>
        <e:if test=${enabled}>
            <p @click=${innerValue++}>${fullName}</p>
            <AnotherComponent prop=${name} />
        </e:if>
        <ul>
            <e:for-each select=${items} as=${item}>
                <li class="item" @click|prevent=${onItemClick(item)}>${item}</li>
            </e:for-each>
        </ul>
    </div>`;
});
```