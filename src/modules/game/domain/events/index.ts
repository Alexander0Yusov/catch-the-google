import { GameFinishedEvent } from "./game-finished.event.js";
import { GameStartedEvent } from "./game-started.event.js";
import { GoogleCaughtEvent } from "./google-caught.event.js";
import { GoogleJumpedEvent } from "./google-jumped.event.js";

export type DomainEvent =
  | GameStartedEvent
  | GoogleJumpedEvent
  | GoogleCaughtEvent
  | GameFinishedEvent;

export { GameStartedEvent } from "./game-started.event.js";
export { GoogleJumpedEvent } from "./google-jumped.event.js";
export { GoogleCaughtEvent } from "./google-caught.event.js";
export { GameFinishedEvent } from "./game-finished.event.js";
