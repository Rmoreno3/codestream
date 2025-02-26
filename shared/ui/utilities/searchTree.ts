"use strict";
// import { Iterables } from "./iterable";

/**
Portions adapted from https://github.com/Microsoft/vscode/blob/b3e6d5bb039a4a9362b52a2c8726267ca68cf64e/src/vs/base/common/map.ts#L352 which carries this notice:

MIT License

Copyright (c) 2015 - present Microsoft Corporation

All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

/**
 * Modifications Copyright CodeStream Inc. under the Apache 2.0 License (Apache-2.0)
 */
export function Isome<T>(
	source: Iterable<T> | IterableIterator<T>,
	predicate: (item: T) => boolean
): boolean {
	for (const item of source) {
		if (predicate(item)) return true;
	}
	return false;
}

export function count<T>(
	source: Iterable<T> | IterableIterator<T>,
	predicate?: (item: T) => boolean
): number {
	let count = 0;
	let next: IteratorResult<T>;

	while (true) {
		next = (source as IterableIterator<T>).next();
		if (next.done) break;

		if (predicate === undefined || predicate(next.value)) {
			count++;
		}
	}

	return count;
}

export function* map<T, TMapped>(
	source: Iterable<T> | IterableIterator<T>,
	mapper: (item: T) => TMapped
): Iterable<TMapped> {
	for (const item of source) {
		yield mapper(item);
	}
}

export interface IKeyIterator {
	reset(key: string): this;
	next(): this;

	hasNext(): boolean;
	cmp(a: string): number;
	value(): string;
}

export class StringIterator implements IKeyIterator {
	private _value: string = "";
	private _pos: number = 0;

	reset(key: string): this {
		this._value = key;
		this._pos = 0;
		return this;
	}

	next(): this {
		this._pos += 1;
		return this;
	}

	hasNext(): boolean {
		return this._pos < this._value.length - 1;
	}

	cmp(a: string): number {
		const aCode = a.charCodeAt(0);
		const thisCode = this._value.charCodeAt(this._pos);
		return aCode - thisCode;
	}

	value(): string {
		return this._value[this._pos];
	}
}

enum CharCode {
	/**
	 * The `/` character.
	 */
	Slash = 47,
	/**
	 * The `\` character.
	 */
	Backslash = 92
}

export class PathIterator implements IKeyIterator {
	private _value!: string;
	private _from!: number;
	private _to!: number;

	reset(key: string): this {
		this._value = key.replace(/\\$|\/$/, "");
		this._from = 0;
		this._to = 0;
		return this.next();
	}

	hasNext(): boolean {
		return this._to < this._value.length;
	}

	next(): this {
		// this._data = key.split(/[\\/]/).filter(s => !!s);
		this._from = this._to;
		let justSeps = true;
		for (; this._to < this._value.length; this._to++) {
			const ch = this._value.charCodeAt(this._to);
			if (ch === CharCode.Slash || ch === CharCode.Backslash) {
				if (justSeps) {
					this._from++;
				} else {
					break;
				}
			} else {
				justSeps = false;
			}
		}
		return this;
	}

	cmp(a: string): number {
		let aPos = 0;
		const aLen = a.length;
		let thisPos = this._from;

		while (aPos < aLen && thisPos < this._to) {
			const cmp = a.charCodeAt(aPos) - this._value.charCodeAt(thisPos);
			if (cmp !== 0) {
				return cmp;
			}
			aPos += 1;
			thisPos += 1;
		}

		if (aLen === this._to - this._from) {
			return 0;
		} else if (aPos <= aLen) {
			return -1;
		} else {
			return 1;
		}
	}

	value(): string {
		return this._value.substring(this._from, this._to);
	}
}

class TernarySearchTreeNode<E> {
	segment!: string;
	value: E | undefined;
	key!: string;
	left: TernarySearchTreeNode<E> | undefined;
	mid: TernarySearchTreeNode<E> | undefined;
	right: TernarySearchTreeNode<E> | undefined;

	isEmpty(): boolean {
		return !this.left && !this.mid && !this.right && !this.value;
	}
}

export class TernarySearchTree<E> {
	static forPaths<E>(): TernarySearchTree<E> {
		return new TernarySearchTree<E>(new PathIterator());
	}

	static forStrings<E>(): TernarySearchTree<E> {
		return new TernarySearchTree<E>(new StringIterator());
	}

	private _iter: IKeyIterator;
	private _root: TernarySearchTreeNode<E> | undefined;

	constructor(segments: IKeyIterator) {
		this._iter = segments;
	}

	clear(): void {
		this._root = undefined;
	}

	set(key: string, element: E): E | undefined {
		const iter = this._iter.reset(key);
		let node: TernarySearchTreeNode<E>;

		if (!this._root) {
			this._root = new TernarySearchTreeNode<E>();
			this._root.segment = iter.value();
		}

		node = this._root;
		while (true) {
			const val = iter.cmp(node.segment);
			if (val > 0) {
				// left
				if (!node.left) {
					node.left = new TernarySearchTreeNode<E>();
					node.left.segment = iter.value();
				}
				node = node.left;
			} else if (val < 0) {
				// right
				if (!node.right) {
					node.right = new TernarySearchTreeNode<E>();
					node.right.segment = iter.value();
				}
				node = node.right;
			} else if (iter.hasNext()) {
				// mid
				iter.next();
				if (!node.mid) {
					node.mid = new TernarySearchTreeNode<E>();
					node.mid.segment = iter.value();
				}
				node = node.mid;
			} else {
				break;
			}
		}
		const oldElement = node.value;
		node.value = element;
		node.key = key;
		return oldElement;
	}

	get(key: string): E | undefined {
		const iter = this._iter.reset(key);
		let node = this._root;
		while (node) {
			const val = iter.cmp(node.segment);
			if (val > 0) {
				// left
				node = node.left;
			} else if (val < 0) {
				// right
				node = node.right;
			} else if (iter.hasNext()) {
				// mid
				iter.next();
				node = node.mid;
			} else {
				break;
			}
		}
		return node ? node.value : undefined;
	}

	delete(key: string): void {
		const iter = this._iter.reset(key);
		const stack: [-1 | 0 | 1, TernarySearchTreeNode<E>][] = [];
		let node = this._root;

		// find and unset node
		while (node) {
			const val = iter.cmp(node.segment);
			if (val > 0) {
				// left
				stack.push([1, node]);
				node = node.left;
			} else if (val < 0) {
				// right
				stack.push([-1, node]);
				node = node.right;
			} else if (iter.hasNext()) {
				// mid
				iter.next();
				stack.push([0, node]);
				node = node.mid;
			} else {
				// remove element
				node.value = undefined;

				// clean up empty nodes
				while (stack.length > 0 && node.isEmpty()) {
					const [dir, parent] = stack.pop()!;
					switch (dir) {
						case 1:
							parent.left = undefined;
							break;
						case 0:
							parent.mid = undefined;
							break;
						case -1:
							parent.right = undefined;
							break;
					}
					node = parent;
				}
				break;
			}
		}
	}

	findSubstr(key: string): E | undefined {
		const iter = this._iter.reset(key);
		let node = this._root;
		let candidate: E | undefined;
		while (node) {
			const val = iter.cmp(node.segment);
			if (val > 0) {
				// left
				node = node.left;
			} else if (val < 0) {
				// right
				node = node.right;
			} else if (iter.hasNext()) {
				// mid
				iter.next();
				candidate = node.value || candidate;
				node = node.mid;
			} else {
				break;
			}
		}
		return (node && node.value) || candidate;
	}

	findSuperstr(key: string): TernarySearchTree<E> | undefined {
		const iter = this._iter.reset(key);
		let node = this._root;
		while (node) {
			const val = iter.cmp(node.segment);
			if (val > 0) {
				// left
				node = node.left;
			} else if (val < 0) {
				// right
				node = node.right;
			} else if (iter.hasNext()) {
				// mid
				iter.next();
				node = node.mid;
			} else {
				// collect
				if (!node.mid) {
					return undefined;
				}
				const ret = new TernarySearchTree<E>(this._iter);
				ret._root = node.mid;
				return ret;
			}
		}
		return undefined;
	}

	forEach(callback: (value: E, index: string) => any) {
		this._forEach(this._root!, callback);
	}

	private _forEach(node: TernarySearchTreeNode<E>, callback: (value: E, index: string) => any) {
		if (node === undefined) return;

		// left
		this._forEach(node.left!, callback);

		// node
		if (node.value) {
			callback(node.value, node.key);
		}

		// mid
		this._forEach(node.mid!, callback);

		// right
		this._forEach(node.right!, callback);
	}

	any(): boolean {
		return this._root !== undefined && !this._root.isEmpty();
	}

	count(predicate?: (entry: E) => boolean): number {
		if (this._root === undefined || this._root.isEmpty()) return 0;

		return count(this.entries(), predicate === undefined ? undefined : ([e]) => predicate(e));
	}

	entries(): Iterable<[E, string]> {
		return this._iterator(this._root!);
	}

	values(): Iterable<E> {
		return map(this.entries(), ([e]) => e);
	}

	highlander(): [E, string] | undefined {
		if (this._root === undefined || this._root.isEmpty()) return undefined;

		const entries = this.entries() as IterableIterator<[E, string]>;

		let count = 0;
		let next: IteratorResult<[E, string]>;
		let value: [E, string] | undefined;

		while (true) {
			next = entries.next();
			if (next.done) break;

			value = next.value;

			count++;
			if (count > 1) return undefined;
		}

		return value;
	}

	some(predicate: (entry: E) => boolean): boolean {
		if (this._root === undefined || this._root.isEmpty()) return false;

		return Isome(this.entries(), ([e]) => predicate(e));
	}

	private *_iterator(node: TernarySearchTreeNode<E> | undefined): IterableIterator<[E, string]> {
		if (node !== undefined) {
			// left
			yield* this._iterator(node.left!);

			// node
			if (node.value) {
				yield [node.value, node.key];
			}

			// mid
			yield* this._iterator(node.mid!);

			// right
			yield* this._iterator(node.right!);
		}
	}
}
