import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import Joi from "joi";
import { GameModule } from "./modules/game/game.module.js";

const configModule = await ConfigModule.forRoot({
  isGlobal: true,
  validationSchema: Joi.object({
    NODE_ENV: Joi.string().valid("development", "production").default("development"),
    DATABASE_URL: Joi.when("NODE_ENV", {
      is: "production",
      then: Joi.string().uri().required(),
      otherwise: Joi.string().uri().optional(),
    }),
    PORT: Joi.number().port().default(3001),
    CORS_ORIGIN: Joi.string().default("*"),
  }).unknown(true),
});

@Module({
  imports: [configModule, GameModule],
})
export class AppModule {}
