import { Game } from "../../domain/entities/game.entity.js";

export interface IGameSessionRepository {
  getById(gameId: string): Promise<Game | null>;
  save(gameId: string, game: Game): Promise<void>;
}
