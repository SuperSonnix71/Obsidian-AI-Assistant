/**
 * Generic MinHeap implementation for efficient Top-K extraction.
 * Time complexity: O(log K) for push/pop operations.
 * Used to find the K largest elements in O(N log K) time instead of O(N log N).
 */
export class MinHeap<T> {
    private heap: T[] = [];
    private compare: (a: T, b: T) => number;

    /**
     * @param compare Comparator function. Should return negative if a < b, positive if a > b, 0 if equal.
     *                For a min-heap of numbers: (a, b) => a - b
     */
    constructor(compare: (a: T, b: T) => number) {
        this.compare = compare;
    }

    get size(): number {
        return this.heap.length;
    }

    peek(): T | undefined {
        return this.heap[0];
    }

    push(value: T): void {
        this.heap.push(value);
        this.bubbleUp(this.heap.length - 1);
    }

    pop(): T | undefined {
        if (this.heap.length === 0) return undefined;
        if (this.heap.length === 1) return this.heap.pop();

        const result = this.heap[0];
        this.heap[0] = this.heap.pop()!;
        this.bubbleDown(0);
        return result;
    }

    toArray(): T[] {
        // Return a copy to avoid mutation
        return [...this.heap];
    }

    toSortedArray(): T[] {
        // Extract all elements in sorted order (ascending for min-heap)
        const result: T[] = [];
        const tempHeap = new MinHeap<T>(this.compare);
        tempHeap.heap = [...this.heap];
        
        while (tempHeap.size > 0) {
            result.push(tempHeap.pop()!);
        }
        return result;
    }

    private bubbleUp(index: number): void {
        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);
            if (this.compare(this.heap[index], this.heap[parentIndex]) >= 0) break;
            this.swap(index, parentIndex);
            index = parentIndex;
        }
    }

    private bubbleDown(index: number): void {
        const length = this.heap.length;
        let smallest = index;

        do {
            index = smallest;
            const leftChild = 2 * index + 1;
            const rightChild = 2 * index + 2;
            smallest = index;

            if (leftChild < length && this.compare(this.heap[leftChild], this.heap[smallest]) < 0) {
                smallest = leftChild;
            }
            if (rightChild < length && this.compare(this.heap[rightChild], this.heap[smallest]) < 0) {
                smallest = rightChild;
            }

            if (smallest !== index) {
                this.swap(index, smallest);
            }
        } while (smallest !== index);
    }

    private swap(i: number, j: number): void {
        [this.heap[i], this.heap[j]] = [this.heap[j], this.heap[i]];
    }
}

/**
 * Find the top K elements from an array using a min-heap.
 * Time complexity: O(N log K) instead of O(N log N) for full sort.
 * 
 * @param items Array of items to process
 * @param k Number of top elements to find
 * @param getValue Function to extract the comparison value (higher = better)
 * @returns Array of top K items (not sorted)
 */
export function findTopK<T>(
    items: T[],
    k: number,
    getValue: (item: T) => number
): T[] {
    if (items.length <= k) {
        return [...items];
    }

    // Use min-heap to keep track of top K elements
    // The smallest of the top K is at the root, so we can quickly compare
    const minHeap = new MinHeap<T>((a, b) => getValue(a) - getValue(b));

    for (const item of items) {
        if (minHeap.size < k) {
            minHeap.push(item);
        } else if (getValue(item) > getValue(minHeap.peek()!)) {
            minHeap.pop();
            minHeap.push(item);
        }
    }

    return minHeap.toArray();
}
