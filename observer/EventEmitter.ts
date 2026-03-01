type Callback<T> = (data: T) => void;

export class EventEmitter {
  #subscribers: Record<string, Callback<unknown>[]> = {};

  addEventListener<T>(eventName: string, callback: Callback<T>): () => void {
    return this.subscribe(eventName, callback);
  }

  on<T>(eventName: string, callback: Callback<T>): () => void {
    return this.subscribe(eventName, callback);
  }

  subscribe<T>(eventName: string, callback: Callback<T>): () => void {
    if (!this.#subscribers[eventName]) {
      this.#subscribers[eventName] = [];
    }

    this.#subscribers[eventName].push(callback as Callback<unknown>);

    return () => {
      this.#unsubscribe(eventName, callback as Callback<unknown>);
    };
  }

  removeEventListener<T>(eventName: string, callback: Callback<T>): void {
    this.#unsubscribe(eventName, callback as Callback<unknown>);
  }

  off<T>(eventName: string, callback: Callback<T>): void {
    this.#unsubscribe(eventName, callback as Callback<unknown>);
  }

  emit<T>(eventName: string, data: T): void {
    this.#subscribers[eventName]?.forEach((callback) => callback(data));
  }

  #unsubscribe(eventName: string, callback: Callback<unknown>): void {
    this.#subscribers[eventName] = this.#subscribers[eventName]?.filter(
      (cb) => cb !== callback
    );
  }
}
