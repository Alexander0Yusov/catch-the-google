export {
  Game,
  type MoveDirection,
  type GameSettings,
  type UpdateGameSettings,
} from "./entities/game.entity.js";
export { Player, type PlayerId } from "./entities/player.entity.js";
export { GameStatus } from "./enums/game-status.enum.js";
export {
  Position,
  type PositionDelta,
} from "./value-objects/position.value-object.js";
export { type GridSize } from "./types/grid-size.type.js";
export {
  GooglePositionDomainService,
  type RandomIndexFn,
} from "./services/google-position.domain-service.js";
export {
  type DomainEvent,
  GameStartedEvent,
  GoogleJumpedEvent,
  GoogleCaughtEvent,
  GameFinishedEvent,
} from "./events/index.js";
