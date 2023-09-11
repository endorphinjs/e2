import type * as ESTree from 'estree';

type PropType = 'prop' | 'container' | 'rest';
type PropInfo = [propName: string, propType: PropType];
interface ComputedRef {
    id: string;
    node: ESTree.CallExpression;
    deps: Set<string>
}

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

    /** computed-переменные, созданные в текущем скоупе */
    computed = new Map<string, ComputedRef>();

    /** Текущая computed-переменная, для которой собираются данные */
    private computedCtx: string | null = null;

    /** Символы, которые были сгенерированы компилятором */
    private issued = new Set<string>();

    /** Счётчик для сгенерированных символов */
    private issuedCounter = new Map<string, number>();

    /** Вернёт `true` если сейчас находимся в контексте сбора данных для computed-значения */
    get inComputedContext(): boolean {
        return this.computedCtx != null;
    }

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

    addComputedDependency(name: string, dep: string) {
        const entry = this.computed.get(name);
        if (entry) {
            entry.deps.add(dep);
        } else {
            throw new Error(`The computed symbol "${name}" doesn’t exists`)
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
        for (const [name, nodes] of scope.usages) {
            if (!scope.declarations.has(name)) {
                const cur = this.usages.get(name) || [];
                this.usages.set(name, cur.concat(nodes));

                if (this.computedCtx) {
                    this.addComputedDependency(this.computedCtx, name);
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

    enterComputed(id: string, node: ESTree.CallExpression) {
        this.computed.set(id, { id, node, deps: new Set() });
        this.computedCtx = id;
    }

    exitComputed(node: ESTree.Node) {
        if (this.computedCtx) {
            const entry = this.computed.get(this.computedCtx);
            if (entry?.node === node) {
                this.computedCtx = null;
            }
        }
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
        let counter = this.issuedCounter.get(name) || 0;
        let id = '';
        do {
            id = name + (counter++ || '');
        } while(this.has(id));
        this.issuedCounter.set(name, counter);
        this.issued.add(id);
        return id;
    }

    /**
     * Вернёт `true` если указанный идентификатор используется в скоупе (без учёта
     * сгенерированных)
     */
    has(id: string): boolean {
        return this.declarations.has(id)
            || this.updates.has(id)
            || this.usages.has(id)
            || this.issued.has(id);
    }
}