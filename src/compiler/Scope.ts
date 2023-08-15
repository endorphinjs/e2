import type * as ESTree from 'estree';
import { last } from '../shared/utils';

type PropType = 'prop' | 'container' | 'rest';
type PropInfo = [propName: string, propType: PropType];

/**
 * Данные для области видимости переменных
 */
export default class Scope {
    /**
     * Список переменных, которые являются пропсами компонента. Ключом является
     * название переменной внутри функции компонента. Значением является массив,
     * где первый элемент – это название пропса, а второй — тип использования пропса
     */
    props = new Map<string, PropInfo>();
    /** Символы, которые *были объявлены* внутри текущего скоупа */
    declarations = new Map<string, ESTree.Node>();
    /** Символы, которые *считываются* внутри текущего скоупа */
    usages = new Map<string, ESTree.Node[]>();
    /** Символы, которые *обновляются* внутри текущего скоупа */
    updates = new Map<string, ESTree.Node[]>();

    /** Зависимости computed-переменных */
    dependencies = new Map<string, Set<string>>();

    private computedStack: string[] = [];
    /** Символы, которые были сгенерированы компилятором */
    private issued = new Map<string, number>();

    addDeclaration(name: string, node: ESTree.Node) {
        this.declarations.set(name, node);
    }

    addUsage(name: string, node: ESTree.Node) {
        const arr = this.usages.get(name);
        if (arr) {
            arr.push(node);
        } else {
            this.usages.set(name, [node]);
        }
    }

    addUpdate(name: string, node: ESTree.Node) {
        const arr = this.updates.get(name);
        if (arr) {
            arr.push(node);
        } else {
            this.updates.set(name, [node]);
        }
    }

    addDependency(name: string, dep: string) {
        const deps = this.dependencies.get(name);
        if (deps) {
            deps.add(dep);
        } else {
            this.dependencies.set(name, new Set([dep]));
        }
    }

    add(name: string, node?: ESTree.Node | null) {
        switch (node?.type) {
            case 'VariableDeclaration':
                return this.addDeclaration(name, node);
            case 'AssignmentExpression':
            case 'UpdateExpression':
                return this.addUpdate(name, node);
            case 'Identifier':
                return this.addUsage(name, node);
        }
    }

    /**
     * Перенос данных из указанного `scope` в текущий
     */
    transfer(scope: Scope) {
        const computed = last(this.computedStack);

        for (const [name, nodes] of scope.usages) {
            if (!scope.declarations.has(name)) {
                const cur = this.usages.get(name) || [];
                this.usages.set(name, cur.concat(nodes));

                if (computed) {
                    this.addDependency(computed, name);
                }
            }
        }

        for (const [name, nodes] of scope.updates) {
            if (!scope.declarations.has(name)) {
                const cur = this.updates.get(name) || [];
                this.updates.set(name, cur.concat(nodes));
            }
        }
    }

    pushComputed(name: string) {
        this.computedStack.push(name);
    }

    popComputed() {
        this.computedStack.pop();
    }

    setProp(symbolName: string, propType: PropType, propName = symbolName) {
        this.props.set(symbolName, [propName, propType]);
    }

    /**
     * Вернёт тип пропса с указанным названием, если такой был действительно
     * объявлен в текущем скоупе
     */
    propType(name: string): PropType | undefined {
        if (this.declarations.has(name)) {
            return this.props.get(name)?.[1];
        }
    }

    /**
     * Создаёт новый идентификатор символа для скоупа, который гарантированно
     * не будет пересекаться с уже имеющимися или используемыми внутри скоупа
     */
    id(name: string): string {
        let counter = this.issued.get(name) || 0;
        let id = '';
        do {
            id = name + (counter++ || '');
        } while(!this.has(id));
        this.issued.set(name, counter);
        return id;
    }

    /**
     * Вернёт `true` если указанный идентификатор используется в скоупе (без учёта
     * сгенерированных)
     */
    has(id: string): boolean {
        return this.declarations.has(id)
            || this.updates.has(id)
            || this.usages.has(id);
    }
}