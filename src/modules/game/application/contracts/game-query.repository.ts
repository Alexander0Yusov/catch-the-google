import { Game } from "../../domain/entities/game.entity.js";

export interface IGameQueryRepository {
  getById(gameId: string): Promise<Game | null>;
}
