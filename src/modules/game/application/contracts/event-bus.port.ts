import { type DomainEvent } from "../../domain/events/index.js";

export interface IEventBus {
  publish(event: DomainEvent): Promise<void> | void;
}
