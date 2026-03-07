import { Inject, Injectable } from "@nestjs/common";
import { type IEventBus } from "../contracts/event-bus.port.js";
import { type IGameSessionRepository } from "../contracts/game-session.repository.js";
import { type DomainEvent } from "../../domain/events/index.js";
import { EVENT_BUS, GAME_SESSION_REPOSITORY } from "../contracts/tokens.js";

export type PauseGameCommand = Readonly<{
  gameId: string;
}>;

@Injectable()
export class PauseGameUseCase {
  constructor(
    @Inject(GAME_SESSION_REPOSITORY)
    private readonly gameSessionRepository: IGameSessionRepository,
    @Inject(EVENT_BUS)
    private readonly eventBus: IEventBus
  ) {}

  async execute(command: PauseGameCommand): Promise<void> {
    const game = await this.gameSessionRepository.getById(command.gameId);

    if (!game) {
      throw new Error(`Game session '${command.gameId}' not found`);
    }

    game.pause();

    await this.#publishDomainEvents(game.getDomainEvents());
    game.clearDomainEvents();
    await this.gameSessionRepository.save(command.gameId, game);
  }

  async #publishDomainEvents(events: readonly DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.eventBus.publish(event);
    }
  }
}
