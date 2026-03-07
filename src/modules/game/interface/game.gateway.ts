import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
} from "@nestjs/websockets";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Server, Socket } from "socket.io";
import { StartGameUseCase } from "../application/usecases/start-game.usecase.js";
import { MovePlayerUseCase } from "../application/usecases/move-player.usecase.js";
import { GetSnapshotQueryHandler } from "../application/usecases/get-snapshot.query-handler.js";
import { StopGameUseCase } from "../application/usecases/stop-game.usecase.js";
import { PauseGameUseCase } from "../application/usecases/pause-game.usecase.js";
import { ResumeGameUseCase } from "../application/usecases/resume-game.usecase.js";
import { SetSettingsUseCase } from "../application/usecases/set-settings.usecase.js";
import {
  GAME_SESSION_REPOSITORY,
  type IGameSessionRepository,
} from "../application/index.js";
import { EventEmitterBus } from "../infrastructure/event-emitter.bus.js";
import { Game } from "../domain/entities/game.entity.js";
import { type UpdateGameSettings } from "../domain/entities/game.entity.js";
import { Position } from "../domain/value-objects/position.value-object.js";

type RpcRequest = Readonly<{
  requestId?: string;
  procedure?: string;
  payload?: Record<string, unknown> | null;
}>;

@Injectable()
@WebSocketGateway({
  cors: { origin: "*" },
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server!: Server;

  private readonly clientRoles = new Map<string, 0 | 1 | 2>();
  private readonly playerOwners: Record<1 | 2, string | null> = { 1: null, 2: null };
  private readonly defaultGameId: string;

  constructor(
    private readonly startGameUseCase: StartGameUseCase,
    private readonly movePlayerUseCase: MovePlayerUseCase,
    private readonly stopGameUseCase: StopGameUseCase,
    private readonly pauseGameUseCase: PauseGameUseCase,
    private readonly resumeGameUseCase: ResumeGameUseCase,
    private readonly setSettingsUseCase: SetSettingsUseCase,
    private readonly getSnapshotQueryHandler: GetSnapshotQueryHandler,
    @Inject(GAME_SESSION_REPOSITORY)
    private readonly gameSessionRepository: IGameSessionRepository,
    private readonly eventBus: EventEmitterBus,
    private readonly configService: ConfigService
  ) {
    this.defaultGameId =
      this.configService.get<string>("GAME_DEFAULT_SESSION_ID") ?? "default-session";

    this.eventBus.on("game-started", (event) => {
      this.server.emit("game-started", event);
    });
    this.eventBus.on("google-jumped", (event) => {
      this.server.emit("google-jumped", event);
    });
    this.eventBus.on("google-caught", (event) => {
      this.server.emit("google-caught", event);
    });
    this.eventBus.on("game-finished", (event) => {
      this.server.emit("game-finished", event);
    });
  }

  async handleConnection(client: Socket): Promise<void> {
    this.clientRoles.set(client.id, 0);
    await this.ensureGameExists(this.defaultGameId);
    await this.emitChange(this.defaultGameId, client);
  }

  handleDisconnect(client: Socket): void {
    const role = this.clientRoles.get(client.id);

    if (role === 1 && this.playerOwners[1] === client.id) {
      this.playerOwners[1] = null;
    }

    if (role === 2 && this.playerOwners[2] === client.id) {
      this.playerOwners[2] = null;
    }

    this.clientRoles.delete(client.id);
  }

  @SubscribeMessage("request")
  async onRequest(
    @ConnectedSocket() client: Socket,
    @MessageBody() request: RpcRequest
  ): Promise<void> {
    const requestId = request.requestId;
    const procedure = request.procedure ?? "";
    const payload = request.payload ?? {};
    const gameId = this.pickGameId(payload);

    try {
      if (procedure === "joinGame") {
        const preferred = Number((payload as { preferredPlayerId?: number }).preferredPlayerId);
        const playerId = this.assignRole(client.id, preferred);
        this.sendResponse(client, requestId, procedure, { playerId });
        return;
      }

      await this.ensureGameExists(gameId);

      if (procedure === "start") {
        await this.startGameUseCase.execute({ gameId });
        await this.emitChange(gameId);
        this.sendResponse(client, requestId, procedure, await this.getSnapshotQueryHandler.execute({ gameId }));
        return;
      }

      if (procedure === "stop") {
        await this.stopGameUseCase.execute({ gameId });
        await this.emitChange(gameId);
        this.sendResponse(client, requestId, procedure, await this.getSnapshotQueryHandler.execute({ gameId }));
        return;
      }

      if (procedure === "pause") {
        await this.pauseGameUseCase.execute({ gameId });
        await this.emitChange(gameId);
        this.sendResponse(client, requestId, procedure, await this.getSnapshotQueryHandler.execute({ gameId }));
        return;
      }

      if (procedure === "resume") {
        await this.resumeGameUseCase.execute({ gameId });
        await this.emitChange(gameId);
        this.sendResponse(client, requestId, procedure, await this.getSnapshotQueryHandler.execute({ gameId }));
        return;
      }

      if (procedure === "setSettings") {
        await this.setSettingsUseCase.execute({
          gameId,
          settings: payload as UpdateGameSettings,
        });
        await this.emitChange(gameId);
        this.sendResponse(client, requestId, procedure, await this.getSnapshotQueryHandler.execute({ gameId }));
        return;
      }

      if (procedure === "getSnapshot") {
        const snapshot = await this.getSnapshotQueryHandler.execute({ gameId });
        this.sendResponse(client, requestId, procedure, snapshot);
        return;
      }

      const move = this.mapMoveProcedure(procedure);

      if (move) {
        this.checkMovePermission(client.id, move.playerId);
        await this.movePlayerUseCase.execute({
          gameId,
          playerId: move.playerId,
          direction: move.direction,
        });
        await this.emitChange(gameId);
        this.sendResponse(client, requestId, procedure, await this.getSnapshotQueryHandler.execute({ gameId }));
        return;
      }

      throw new Error(`Unknown procedure: ${procedure}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.sendError(client, requestId, procedure, message);
    }
  }

  private async emitChange(gameId: string, client?: Socket): Promise<void> {
    const state = await this.getSnapshotQueryHandler.execute({ gameId });
    const target = client ? this.server.to(client.id) : this.server;
    target.emit("event", {
      type: "event",
      eventName: "change",
      data: { state },
    });
  }

  private sendResponse(
    client: Socket,
    requestId: string | undefined,
    procedure: string,
    result: unknown
  ): void {
    client.emit("response", {
      type: "response",
      requestId,
      procedure,
      result,
    });
  }

  private sendError(
    client: Socket,
    requestId: string | undefined,
    procedure: string,
    error: string
  ): void {
    client.emit("response", {
      type: "response",
      requestId,
      procedure,
      error,
    });
  }

  private pickGameId(payload: Record<string, unknown>): string {
    const maybeGameId = payload.gameId;
    return typeof maybeGameId === "string" && maybeGameId.length > 0
      ? maybeGameId
      : this.defaultGameId;
  }

  private assignRole(clientId: string, preferredPlayerId: number): 0 | 1 | 2 {
    if ((preferredPlayerId === 1 || preferredPlayerId === 2) && !this.playerOwners[preferredPlayerId]) {
      this.playerOwners[preferredPlayerId] = clientId;
      this.clientRoles.set(clientId, preferredPlayerId);
      return preferredPlayerId;
    }

    if (!this.playerOwners[1]) {
      this.playerOwners[1] = clientId;
      this.clientRoles.set(clientId, 1);
      return 1;
    }

    if (!this.playerOwners[2]) {
      this.playerOwners[2] = clientId;
      this.clientRoles.set(clientId, 2);
      return 2;
    }

    this.clientRoles.set(clientId, 0);
    return 0;
  }

  private checkMovePermission(clientId: string, playerId: 1 | 2): void {
    const role = this.clientRoles.get(clientId) ?? 0;
    const ownsAtLeastOne = this.playerOwners[1] === clientId || this.playerOwners[2] === clientId;
    const secondSeatIsFree = !this.playerOwners[1] || !this.playerOwners[2];

    if (ownsAtLeastOne && secondSeatIsFree) {
      return;
    }

    if (role !== playerId) {
      throw new Error(`This connection does not control Player ${playerId}`);
    }
  }

  private mapMoveProcedure(procedure: string): {
    playerId: 1 | 2;
    direction: "up" | "down" | "left" | "right";
  } | null {
    const map: Record<string, { playerId: 1 | 2; direction: "up" | "down" | "left" | "right" }> = {
      movePlayer1Up: { playerId: 1, direction: "up" },
      movePlayer1Down: { playerId: 1, direction: "down" },
      movePlayer1Left: { playerId: 1, direction: "left" },
      movePlayer1Right: { playerId: 1, direction: "right" },
      movePlayer2Up: { playerId: 2, direction: "up" },
      movePlayer2Down: { playerId: 2, direction: "down" },
      movePlayer2Left: { playerId: 2, direction: "left" },
      movePlayer2Right: { playerId: 2, direction: "right" },
    };

    return map[procedure] ?? null;
  }

  private async ensureGameExists(gameId: string): Promise<void> {
    const game = await this.gameSessionRepository.getById(gameId);

    if (game) {
      return;
    }

    const gridSize = { columns: 4, rows: 4 };
    const newGame = new Game({
      gridSize,
      player1Start: Position.create(1, 1, gridSize),
      player2Start: Position.create(4, 4, gridSize),
      googleStart: Position.create(2, 2, gridSize),
    });

    await this.gameSessionRepository.save(gameId, newGame);
  }
}
