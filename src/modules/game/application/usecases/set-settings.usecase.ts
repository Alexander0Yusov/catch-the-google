import { Inject, Injectable } from "@nestjs/common";
import { type IEventBus } from "../contracts/event-bus.port.js";
import { type IGameSessionRepository } from "../contracts/game-session.repository.js";
import { type DomainEvent } from "../../domain/events/index.js";
import { type UpdateGameSettings } from "../../domain/entities/game.entity.js";
import { EVENT_BUS, GAME_SESSION_REPOSITORY } from "../contracts/tokens.js";

export type SetSettingsCommand = Readonly<{
  gameId: string;
  settings: UpdateGameSettings;
}>;

@Injectable()
export class SetSettingsUseCase {
  constructor(
    @Inject(GAME_SESSION_REPOSITORY)
    private readonly gameSessionRepository: IGameSessionRepository,
    @Inject(EVENT_BUS)
    private readonly eventBus: IEventBus
  ) {}

  async execute(command: SetSettingsCommand): Promise<void> {
    const game = await this.gameSessionRepository.getById(command.gameId);

    if (!game) {
      throw new Error(`Game session '${command.gameId}' not found`);
    }

    game.setSettings(command.settings);

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
