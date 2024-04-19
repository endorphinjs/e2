import { TemplateNode } from './traverse';
import { TemplateVariable } from './types';

interface NodeTreeItem {
    v?: TemplateVariable;
    parent?: TemplateNode | null;
    node: TemplateNode;
    children: TemplateNode[];
}

export default class NodeTreeLookup {
    public data = new Map<TemplateNode, NodeTreeItem>();

    /**
     * Сохраняет связь между узлом и его родителем
     */
    set(node: TemplateNode, parent?: TemplateNode | null) {
        if (parent) {
            const item = this.data.get(parent);
            if (item) {
                item.children.push(node);
            } else {
                console.warn('No entry for parent node', parent);
            }
        }

        this.data.set(node, {
            node,
            children: [],
            parent,
        });
    }

    /**
     * Сохраняет локальную переменную функции, которая ссылается на узел `node`
     */
    setVar(node: TemplateNode, v?: TemplateVariable) {
        const item = this.data.get(node);
        if (item) {
            item.v = v;
        }
    }

    /**
     * Возвращает родительский узел для указанного узла
     */
    getParent(node: TemplateNode): TemplateNode | null | undefined {
        return this.data.get(node)?.parent;
    }

    /**
     * Возвращает переменную на родительский узел для указанного узла `node`
     */
    getParentVar(node: TemplateNode): TemplateVariable | undefined {
        const parent = this.getParent(node);
        if (parent) {
            return this.data.get(parent)?.v;
        }
    }
}