import { Inject, Injectable } from "@nestjs/common";
import { type IGameQueryRepository } from "../contracts/game-query.repository.js";
import {
  gameSnapshotMapper,
  type GameSnapshotDto,
} from "../mappers/game-snapshot.mapper.js";
import { GAME_QUERY_REPOSITORY } from "../contracts/tokens.js";

export type GetSnapshotQuery = Readonly<{
  gameId: string;
}>;

@Injectable()
export class GetSnapshotQueryHandler {
  constructor(
    @Inject(GAME_QUERY_REPOSITORY)
    private readonly gameQueryRepository: IGameQueryRepository
  ) {}

  async execute(query: GetSnapshotQuery): Promise<GameSnapshotDto> {
    const game = await this.gameQueryRepository.getById(query.gameId);

    if (!game) {
      throw new Error(`Game session '${query.gameId}' not found`);
    }

    return gameSnapshotMapper(game);
  }
}
