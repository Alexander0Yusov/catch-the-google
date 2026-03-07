import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const allowedOrigins = String(configService.get<string>("CORS_ORIGIN", "*"))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins.includes("*") ? true : allowedOrigins,
  });

  const port = Number(configService.get<number>("PORT", 3001));
  await app.listen(port);
}

bootstrap();
