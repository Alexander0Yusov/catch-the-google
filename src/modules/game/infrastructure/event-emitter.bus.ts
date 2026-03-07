import { Injectable } from "@nestjs/common";
import { EventEmitter } from "node:events";
import { type IEventBus } from "../application/contracts/event-bus.port.js";
import { type DomainEvent } from "../domain/events/index.js";

@Injectable()
export class EventEmitterBus implements IEventBus {
  private readonly eventEmitter = new EventEmitter();

  publish(event: DomainEvent): void {
    this.eventEmitter.emit(event.name, event);
  }

  on<TEvent extends DomainEvent>(
    eventName: TEvent["name"],
    callback: (event: TEvent) => void
  ): () => void {
    this.eventEmitter.on(eventName, callback);
    return () => {
      this.eventEmitter.off(eventName, callback);
    };
  }
}
