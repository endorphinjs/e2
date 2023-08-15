export function findLastIndex<T>(arr: T[], predicate: (value: T, index: number) => boolean) {
    for (let i = arr.length - 1; i >= 0; i--) {
        if (predicate(arr[i], i)) {
            return i;
        }
    }

    return -1;
}

export function findLast<T>(arr: T[], predicate: (value: T, index: number) => boolean) {
    const ix = findLastIndex(arr, predicate);
    return ix !== -1 ? arr[ix] : void 0;
}

export function at<T>(arr: T[], offset: number): T | undefined {
    return arr[offset >= 0 ? offset : arr.length + offset];
}

export function last<T>(arr: T[]): T | undefined {
    return arr[arr.length - 1];
}
