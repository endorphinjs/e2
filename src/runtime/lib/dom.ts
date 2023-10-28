import type { AttachTarget } from '../types';

const enum WhereAttach {
    Append = 0,
    Prepend = 1,
    After = 2
}

/** Текущая точка монтирования */
const attachTarget: AttachTarget = [document.body, WhereAttach.Append];

export function attach(elem: Element) {
    const [target, where] = attachTarget;
    if (where === WhereAttach.Append) {
        target.append(elem);
    } if (where === WhereAttach.Prepend) {
        target.prepend(elem);
    } else {
        target.after(elem);
    }
}

export function setTargetAfter(elem: Element) {
    attachTarget[0] = elem;
    attachTarget[1] = WhereAttach.After;
}

export function setTargetPrepend(elem: Element) {
    attachTarget[0] = elem;
    attachTarget[1] = WhereAttach.Prepend;
}

export function setTarget(target: Element | AttachTarget) {
    if (Array.isArray(target)) {
        attachTarget[0] = target[0];
        attachTarget[1] = target[1];
    } else {
        setTargetPrepend(target);
    }
}