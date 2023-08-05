import { defineComponent, onDestory, useComponent, computed, html } from './endorphin';
import AnotherComponent from './AnotherComponent';
import './style.css';

// Общая переменная модуля, как в обычном JS
let instances = 0;
const items = ['a', 'b', 'c'];

// Объявляем компонент через вызов `defineComponent()`.
// Вернётся класс, который в любом месте можно создать так:
// import MyComponent from './component.ts';
// const c = new MyComponent(props);
export default defineComponent(({ enabled, name }) => {
    // Вызов текущей функции работает как `willMount()` из предыдущей
    // версии эндорфина

    // Свободно обращаемся к общим переменным модуля
    instances++;

    // Локальные переменные, которые буду использоваться в шаблоне,
    // объявляем в JS: получим бесплатную типизацию из JS/TS
    let item;
    let innerValue = 1;

    // Объявляем реактивные переменные: они будут автоматически пересчитываться,
    // когда поменяется любое значение внутри коллбэка
    const fullName = computed(() => enabled ? name : 'Disabled');
    const uppercaseFullName = computed(() => fullName.toUpperCase());

    const onItemClick = (item) => {
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
    // * можно использовать плагин для Lit, который автоматически подсветит
    //   HTML внутри такой строки
    return html`<div class="${innerValue % 2 ? 'foo' : 'bar'}"
                     class:enabled=${enabled}>
        <e:if test=${enabled}>
            <p @click=${innerValue++} title=${uppercaseFullName}>${fullName}</p>
            <AnotherComponent prop=${name} />
        </e:if>
        <ul>
            <e:for-each select=${items} as=${item}>
                <li class="item" @click|prevent=${onItemClick(item)}>${item}</li>
            </e:for-each>
        </ul>
    </div>`;
});