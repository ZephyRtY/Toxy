/* eslint-disable no-unused-vars */
/* eslint-disable no-underscore-dangle */
import React from 'react';
import { getAdm } from './createStore';
import { globalStateHandler, observableHandler } from './observable';
import Reaction from './reaction';
interface IModel<T> {
	proxy_: ProxyConstructor | null;
	revoke_: (setFresh: React.Dispatch<React.SetStateAction<boolean>>) => void;
}
export let globalDerivation: any = null;
export let globalAutorun: (() => void) | null = null;
export interface ModelMask<T> {
	autorun: () => void;
	value: T;
}
// 每个共享状态的组件树的根store
export class Model<T> implements IModel<T> {
	proxy_: ProxyConstructor | null;
	private target_: T | null;
	private readonly this_: Model<T> | null = null;
	private _current: Reaction | null = null;
	revoke_: () => boolean;
	private _observers: Map<Reaction, Set<Object | PropertyKey>> = new Map();
	private _observables: Map<PropertyKey, Set<Reaction>> = new Map();
	private _hasMainDerivation: boolean = false;
	private _setFresh: React.Dispatch<React.SetStateAction<boolean>> | null =
		() => {};
	private _isRevoked: boolean = false;
	constructor(target: T) {
		this.target_ = target;
		getAdm(target).newModel(this);
		this.this_ = this;
		//内层proxy
		const innerProxy = Proxy.revocable(
			target as any,
			{ ...observableHandler, this_: this } as any
		);
		//外层proxy
		const outerProxy = Proxy.revocable(
			innerProxy.proxy,
			globalStateHandler
		);
		this.proxy_ = outerProxy.proxy;
		this.revoke_ = () => {
			outerProxy.revoke();
			innerProxy.revoke();
			getAdm(this.target_).removeFresh(this._setFresh!);
			setTimeout(() => {
				const f = this._setFresh;
				this.destroy();
				f!((v) => !v);
			}, 0);
			return true;
		};
	}

	autorun(fn: () => void): void {
		const reaction = new Reaction(fn);
		this._observers.set(reaction, new Set());
		this._current = reaction;
		fn();
		this._current = null;
	}

	reportObserver(prop: PropertyKey) {
		this._observers.get(this._current!)!.add(prop);
		if (!this._observables.has(prop)) {
			this._observables.set(prop, new Set());
		}
		this._observables.get(prop)?.add(this._current!);
	}
	private reportUpdate(prop: PropertyKey) {
		this._observables.get(prop)?.forEach((v) => v.runreaction());
	}
	private destroy() {
		this._hasMainDerivation = false;
		this._isRevoked = true;
		this._setFresh = null;
		this.revoke_ = () => false;
		this.proxy_ = new Proxy(Object.assign({}, this.target_ as any), {
			set() {
				return true;
			}
		});
		this._observables.clear();
		this._observers.clear();
		this.target_ = null;
	}
	isRevoked() {
		return this._isRevoked;
	}
	hasMainStore() {
		return this._hasMainDerivation;
	}

	rootStoreMounted(setFresh: React.Dispatch<React.SetStateAction<boolean>>) {
		if (this._hasMainDerivation) {
			throw Error('There is already a main derivation');
		} else {
			this._hasMainDerivation = true;
			this._setFresh = setFresh;
			getAdm(this.target_).addFresh(setFresh);
		}
	}

	log() {
		console.log(this);
	}
	get value() {
		return this.proxy_ as unknown as T;
	}
	get current() {
		return this._current;
	}

	get observable() {
		return this._observables;
	}

	get target() {
		return this.target_;
	}
}

export default Model;
