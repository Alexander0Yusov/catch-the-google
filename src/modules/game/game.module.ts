import { Module } from "@nestjs/common";
import {
  EVENT_BUS,
  GAME_QUERY_REPOSITORY,
  GAME_SESSION_REPOSITORY,
} from "./application/contracts/tokens.js";
import { GetSnapshotQueryHandler } from "./application/usecases/get-snapshot.query-handler.js";
import { MovePlayerUseCase } from "./application/usecases/move-player.usecase.js";
import { PauseGameUseCase } from "./application/usecases/pause-game.usecase.js";
import { ResumeGameUseCase } from "./application/usecases/resume-game.usecase.js";
import { SetSettingsUseCase } from "./application/usecases/set-settings.usecase.js";
import { StartGameUseCase } from "./application/usecases/start-game.usecase.js";
import { StopGameUseCase } from "./application/usecases/stop-game.usecase.js";
import { EventEmitterBus } from "./infrastructure/event-emitter.bus.js";
import { PostgresGameRepository } from "./infrastructure/postgres-game.repository.js";
import { GameGateway } from "./interface/game.gateway.js";

@Module({
  providers: [
    PostgresGameRepository,
    EventEmitterBus,
    {
      provide: GAME_SESSION_REPOSITORY,
      useExisting: PostgresGameRepository,
    },
    {
      provide: GAME_QUERY_REPOSITORY,
      useExisting: PostgresGameRepository,
    },
    {
      provide: EVENT_BUS,
      useExisting: EventEmitterBus,
    },
    StartGameUseCase,
    MovePlayerUseCase,
    StopGameUseCase,
    PauseGameUseCase,
    ResumeGameUseCase,
    SetSettingsUseCase,
    GetSnapshotQueryHandler,
    GameGateway,
  ],
  exports: [
    StartGameUseCase,
    MovePlayerUseCase,
    StopGameUseCase,
    PauseGameUseCase,
    ResumeGameUseCase,
    SetSettingsUseCase,
    GetSnapshotQueryHandler,
    GAME_SESSION_REPOSITORY,
    GAME_QUERY_REPOSITORY,
    EVENT_BUS,
  ],
})
export class GameModule {}
