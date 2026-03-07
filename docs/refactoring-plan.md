# Refactoring Plan: Catch the Google -> Clean Architecture

Reference Project: Bloggers Platform (NestJS, DDD)

## Entity Mapping:

- GameState (Existing) -> Domain Entity: `game.entity.ts` (Class: `Game`)
- Catch Event -> Use Case: `catch-target.usecase.ts` (Class: `CatchTargetUseCase`)
- Move Target -> Use Case: `move-target.usecase.ts` (Class: `MoveTargetUseCase`)

## Infrastructure & Interface:

- WebSockets/EventEmitter -> Interface Layer: `game.gateway.ts` (or `game.controller.ts`)
- Local Storage/DB -> Infrastructure Layer: `game.repository.ts`
