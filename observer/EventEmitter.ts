// @ts-nocheck
export class EventEmitter {
  #subscribers = {};

  addEventListener(eventName, callback) {
    return this.subscribe(eventName, callback);
  }

  on(eventName, callback) {
    return this.subscribe(eventName, callback);
  }

  subscribe(eventName, callback) {
    if (!this.#subscribers[eventName]) {
      this.#subscribers[eventName] = [];
    }

    this.#subscribers[eventName].push(callback);

    return () => {
      this.#unsubscribe(eventName, callback);
    };
  }

  removeEventListener(eventName, callback) {
    this.#unsubscribe(eventName, callback);
  }

  off(eventName, callback) {
    this.#unsubscribe(eventName, callback);
  }

  emit(eventName, data) {
    this.#subscribers[eventName]?.forEach((callback) => callback(data));
  }

  #unsubscribe(eventName, callback) {
    this.#subscribers[eventName] = this.#subscribers[eventName]?.filter(
      (cb) => cb !== callback
    );
  }
}


