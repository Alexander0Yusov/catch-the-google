import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import Joi from "joi";
import { GameModule } from "./modules/game/game.module.js";

const configModule = await ConfigModule.forRoot({
  isGlobal: true,
  validationSchema: Joi.object({
    DATABASE_URL: Joi.string().uri().required(),
    PORT: Joi.number().port().default(3001),
    NODE_ENV: Joi.string().valid("development", "production").required(),
    CORS_ORIGIN: Joi.string().default("*"),
  }).unknown(true),
});

@Module({
  imports: [configModule, GameModule],
})
export class AppModule {}
