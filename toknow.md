# TO KNOW: Практическая книга по созданию Catch The Google

## 0. Как читать этот документ

Этот файл описывает проект как будто он создавался с нуля сразу в текущей архитектуре, кратчайшим практичным путем.

Формат описания:
- Цель: что хотим получить.
- Решение: какую технологию/паттерн выбираем и почему.
- Реализация: какие файлы/классы/методы пишем.
- Результат: что проверяем и как понимаем, что шаг завершен.

Ключевой принцип: чтобы получить конкретную функцию, мы выполняем конкретный набор инженерных действий.

---

## 1. Бизнес-цель и требования к системе

### 1.1 Продуктовая цель

Нужно реализовать realtime-игру на сетке, где:
- два игрока соревнуются, кто быстрее поймает Google;
- состояние матча синхронизировано между клиентами;
- сервер является single source of truth;
- поведение игры сохраняется между запросами и при необходимости персистится в PostgreSQL.

### 1.2 Нефункциональные требования

- Реакция в реальном времени: WebSocket-транспорт.
- Ясная архитектура: Clean Architecture + DDD.
- Прозрачная эволюция: тесты, линтинг, проверка миграций.
- Готовность к деплою: frontend на GitHub Pages, backend на Render.

### 1.3 Почему стек выбран именно так

- NestJS: DI, модульность, удобная сборка boundaries между слоями.
- Socket.IO: стабильно работает в браузере, удобен как транспорт RPC+event.
- PostgreSQL + pg: минимально достаточная и надежная persistence для игровых сессий.
- Vitest + Playwright: быстрые юнит/интеграционные проверки + браузерный e2e.

---

## 2. Скелет проекта: от идеи к структуре

Чтобы изолировать бизнес-логику от инфраструктуры, делаем вертикальный модуль `game` с четырьмя слоями:

```mermaid
flowchart LR
  IF[Interface] --> AP[Application]
  AP --> DM[Domain]
  AP --> INF[Infrastructure]
  IF --> AP
  INF --> AP
```

Практический смысл:
- Domain ничего не знает про Socket.IO, SQL и Node API.
- Application оркестрирует сценарии (`*.usecase.ts`, `*.query-handler.ts`).
- Infrastructure подключает внешние системы.
- Interface преобразует вход/выход транспорта в вызовы use case.

---

## 3. Пошаговая реализация функциональности (как в инженерном дневнике)

## 3.1 Чтобы приложение запускалось как backend-сервис

### Цель
Поднять NestJS приложение, настроить CORS и порт.

### Решение
- В `src/app.module.ts` собрать корневой модуль.
- В `src/main.ts` сделать bootstrap.
- Валидацию env выполнить через `@nestjs/config` + `joi`.

### Реализация
- `AppModule` импортирует `ConfigModule` и `GameModule`.
- В `ConfigModule.forRoot` заданы правила:
  - `NODE_ENV`: `development|production`;
  - `DATABASE_URL`: обязателен в `production`;
  - `PORT`: default `3001`;
  - `CORS_ORIGIN`: default `*`.
- `bootstrap()`:
  - создает Nest app;
  - читает `CORS_ORIGIN`, режет строку по запятым;
  - включает CORS;
  - слушает `PORT`.

### Результат
Backend запускается командой `npm run start:back`.

---

## 3.2 Чтобы можно было создавать и хранить игровую сессию

### Цель
Нужен объект игры, который можно получить по `gameId`, изменять и сохранять.

### Решение
Разделить на порты и адаптер:
- `IGameSessionRepository` (command)
- `IGameQueryRepository` (query)
- `PostgresGameRepository` как реализация обоих.

### Реализация
В `GameModule` создаем DI-привязки:
- `GAME_SESSION_REPOSITORY -> PostgresGameRepository`
- `GAME_QUERY_REPOSITORY -> PostgresGameRepository`

Практический эффект:
- use case-слой не зависит от SQL;
- можно подменить репозиторий без изменения домена и use case.

---

## 3.3 Чтобы игра имела строгие правила движения

### Цель
Игроки не должны выходить за поле и занимать одну клетку.

### Решение
- Ввести `Position` как Value Object для координат.
- Перемещение игрока делать через `Player.move(...)` с проверкой занятости.
- Валидность координат централизовать в `Position.create(...)`.

### Реализация
- `Position.create(x, y, gridSize)`:
  - проверяет целочисленность;
  - проверяет границы.
- `Position.move(delta, gridSize)` возвращает новый валидный `Position`.
- `Player.move(delta, gridSize, occupied)`:
  - вычисляет следующую позицию;
  - блокирует шаг при попадании в `occupied`.

### Результат
Логика перемещения детерминирована и не размазана по UI/транспорту.

---

## 3.4 Чтобы фиксировалась поимка Google и начислялись очки

### Цель
При попадании игрока в клетку Google нужно:
- увеличить очки игрока;
- опубликовать событие;
- либо завершить игру, либо переместить Google.

### Решение
Собрать это в агрегате `Game`:
- `move(playerId, direction)`
- `catch(playerId)`
- `jumpGoogle(randomIndex)`

### Реализация
В use case `MovePlayerUseCase.execute(...)` вызывается:
1. `game.move(...)`
2. `game.catch(...)`
3. публикация `DomainEvent`
4. `save(...)`

### Результат
Одна команда хода приводит к целостному state transition.

---

## 3.5 Чтобы pause/resume работали на уровне домена

### Цель
Уметь замораживать матч без потери состояния.

### Решение
- Статусы через enum `GameStatus`.
- Доменные методы `pause()` и `resume()`.
- Use case-обертки `PauseGameUseCase`, `ResumeGameUseCase`.

### Реализация
- `Game.pause()` меняет статус только из `in-progress` -> `paused`.
- `Game.resume()` только из `paused` -> `in-progress`.
- В `GameGateway` процедуры `pause`/`resume` routed в use case.

### Результат
Технически функция реализована end-to-end на backend. UI-кнопки pause/resume в текущем фронте нет.

---

## 3.6 Чтобы клиенты получали изменения мгновенно

### Цель
После каждой операции UI должен получать свежий snapshot.

### Решение
- `GameGateway` после действия вызывает `emitChange(gameId)`.
- `emitChange` делает query через `GetSnapshotQueryHandler`.
- Рассылается событие `{ type: "event", eventName: "change", data: { state } }`.

### Результат
Все подключенные клиенты синхронизируются без polling.

---

## 3.7 Чтобы доменные события были независимы от транспорта

### Цель
Поддержать event-driven реакцию без привязки к Socket.IO.

### Решение
- В domain хранить `domainEvents` внутри агрегата.
- В application публиковать их через порт `IEventBus`.
- В infrastructure использовать `EventEmitterBus`.

### Реализация
Во всех mutating use cases общий паттерн:
1. вызвать доменный метод;
2. `#publishDomainEvents(...)`;
3. `game.clearDomainEvents()`;
4. сохранить агрегат.

### Результат
Одинаковый шаблон оркестрации, предсказуемый для ревью и тестов.

---

## 3.8 Чтобы persistence не ломала локальный запуск

### Цель
Приложение должно работать даже без БД.

### Решение
В `PostgresGameRepository` реализовать dual-mode:
- если `DATABASE_URL` есть и схема готова -> Postgres mode;
- иначе -> in-memory fallback.

### Реализация
- Поля `enabled`, `pool`, `schemaReady`, `inMemorySessions`.
- `#canPersist()` определяет режим.
- `getById` и `save` всегда работают с `inMemorySessions`, а SQL используется условно.

### Результат
Local dev не блокируется инфраструктурой.

---

## 3.9 Чтобы схема БД контролировалась автоматически

### Цель
Не запускать сервис с “полусломанной” схемой.

### Решение
- SQL-миграция `back/migrations/001_init_2.sql`.
- Скрипт `scripts/check-migrations.mjs` для CI/локального контроля.

### Реализация
`check-migrations` проверяет, что SQL-файл содержит фрагменты:
- `players_2`
- `game_sessions_2`
- `game_events_2`
- `scores_2`

### Результат
Базовая защита от accidental drift.

---

## 3.10 Чтобы frontend мог общаться с backend как с локальным объектом

### Цель
Упростить UI-код: пусть клиент вызывает методы, а транспорт скрыт.

### Решение
Реализовать `GameRemoteProxy` (в `docs/dist/game-remote-proxy.js`) как RPC-обертку над Socket.IO.

### Реализация
- `connect()` инициализирует socket и подписки на события.
- Методы `start/stop/movePlayer*` делегируют в `Api.emitRequest(...)`.
- `#mergeState(snapshot)` поддерживает консистентный локальный state.

### Результат
UI оперирует игровыми методами, а не низкоуровневыми socket packet-структурами.

---

## 4. Полная модель кода: классы, поля, методы, private-детали

## 4.1 Composition Root и модульная сборка

### `AppModule` (`src/app.module.ts`)

Поля/элементы:
- `configModule`: результат `ConfigModule.forRoot(...)`.

Методы/логика:
- Методов класса нет.
- Декоратор `@Module({ imports: [configModule, GameModule] })` формирует корневой graph.

### `GameModule` (`src/modules/game/game.module.ts`)

Поля/элементы:
- providers: `PostgresGameRepository`, `EventEmitterBus`, use cases, gateway, token-bindings.
- exports: use cases + DI tokens.

Методы:
- нет (конфигурационный класс).

---

## 4.2 Interface layer

### `GameGateway`

Поля:
- `private readonly server!: Server`
- `private readonly clientRoles: Map<string, 0|1|2>`
- `private readonly playerOwners: Record<1|2, string|null>`
- `private readonly defaultGameId: string`
- injected:
  - `startGameUseCase`
  - `movePlayerUseCase`
  - `stopGameUseCase`
  - `pauseGameUseCase`
  - `resumeGameUseCase`
  - `setSettingsUseCase`
  - `getSnapshotQueryHandler`
  - `gameSessionRepository`
  - `eventBus`
  - `configService`

Public methods:
- `handleConnection(client)`
- `handleDisconnect(client)`
- `onRequest(client, request)`

Private methods:
- `emitChange(gameId, client?)`
- `sendResponse(client, requestId, procedure, result)`
- `sendError(client, requestId, procedure, error)`
- `pickGameId(payload)`
- `assignRole(clientId, preferredPlayerId)`
- `checkMovePermission(clientId, playerId)`
- `releaseOwnedSlots(clientId)`
- `mapMoveProcedure(procedure)`
- `ensureGameExists(gameId)`

Типы внутри файла:
- `type RpcRequest = Readonly<{ requestId?; procedure?; payload?; }>`

Назначение private-методов:
- `emitChange`: единая точка broadcast/targeted push snapshot.
- `assignRole`: atomic-логика назначения роли.
- `mapMoveProcedure`: table-driven map RPC -> command.
- `ensureGameExists`: lazy-init default game session.

---

## 4.3 Application layer

### Контракты

- `IEventBus.publish(event)`
- `IGameSessionRepository.getById/save`
- `IGameQueryRepository.getById`
- tokens:
  - `GAME_SESSION_REPOSITORY`
  - `GAME_QUERY_REPOSITORY`
  - `EVENT_BUS`

### DTO и user-defined types

- `StartGameCommand { gameId }`
- `MovePlayerCommand { gameId, playerId, direction }`
- `PauseGameCommand { gameId }`
- `ResumeGameCommand { gameId }`
- `StopGameCommand { gameId }`
- `SetSettingsCommand { gameId, settings }`
- `GetSnapshotQuery { gameId }`
- `GameSnapshotDto`:
  - `status`
  - `settings.pointsToWin`
  - `settings.gridSize.columns/rows`
  - `settings.googleJumpInterval`
  - `settings.gameDurationMs`
  - `player1`, `player2`, `google`
  - `score`
  - `startedAt`, `remainingTimeMs`, `sessionId`
  - `currentTurnPlayerId`

### Use cases

#### `StartGameUseCase`

Поля:
- `gameSessionRepository`
- `eventBus`

Методы:
- `execute(command)`
- `#publishDomainEvents(events)` (private)

Шаги execute:
1. достать игру;
2. `game.start()`;
3. publish domain events;
4. clear events;
5. save.

Аналогичный шаблон у:
- `PauseGameUseCase`
- `ResumeGameUseCase`
- `StopGameUseCase`
- `SetSettingsUseCase`

#### `MovePlayerUseCase`

Разница:
- кроме `move`, вызывает `catch` в том же transactional intent.

#### `GetSnapshotQueryHandler`

Поля:
- `gameQueryRepository`

Метод:
- `execute(query): Promise<GameSnapshotDto>`

Схема:
1. getById;
2. map через `gameSnapshotMapper`.

---

## 4.4 Domain layer

### Типы

- `MoveDirection = "up" | "down" | "left" | "right"`
- `GameSettings`
- `UpdateGameSettings`
- `GameParams` (internal type)
- `PlayerId = 1 | 2`
- `GridSize`
- `PositionDelta`
- `RandomIndexFn`
- `DomainEvent` union

### `Game` aggregate

Поля:
- `private settings: GameSettings`
- `private readonly player1: Player`
- `private readonly player2: Player`
- `private readonly domainEvents: DomainEvent[]`
- `private googlePosition: Position`
- `private status: GameStatus = Pending`

Public methods:
- `getStatus()`
- `getPlayer(id)`
- `getGooglePosition()`
- `getGridSize()`
- `getSettings()`
- `getScore()`
- `getDomainEvents()`
- `clearDomainEvents()`
- `addEvent(event)`
- `start()`
- `stop()`
- `pause()`
- `resume()`
- `finish(winnerId)`
- `setSettings(nextSettings)`
- `move(playerId, direction)`
- `catch(playerId)`
- `jumpGoogle(randomIndex)`
- `setGooglePosition(position)`

Private methods:
- `#directionToDelta(direction)`
- `#defaultRandomIndex(maxExclusive)`
- `#buildDefaultPositions(gridSize)`
- `#normalizePositionsForGrid(gridSize)`
- `#isInsideGrid(position, gridSize)`

Ключевые инварианты:
- игроки не стартуют в одной клетке;
- Google не стартует и не ставится на клетку игрока;
- move/catch только в `in-progress`;
- settings merge сохраняет старые значения при partial update.

### `Player`

Поля:
- `public readonly id`
- `private _position`
- `private _points = 0`

Методы:
- геттеры `position`, `points`
- `move(delta, gridSize, occupied)`
- `addPoint()`
- `resetPoints()`
- `setPosition(position)`

### `Position`

Поля:
- `public readonly x`
- `public readonly y`

Методы:
- `static create(x, y, gridSize)`
- `move(delta, gridSize)`
- `equals(other)`

Private constructor:
- `constructor(x, y)`

### `GooglePositionDomainService`

Методы:
- `static nextPosition(params)`
- `static #getAvailablePositions(gridSize, excludedPositions)`

Алгоритм:
1. исключить позиции игроков и текущий Google;
2. если нет вариантов — fallback: исключить только игроков;
3. выбрать индекс через внешнюю функцию `randomIndex`;
4. проверить корректность индекса.

### Domain events

- `GameStartedEvent`:
  - поля: `name`, `status`, `occurredAt`
- `GoogleJumpedEvent`:
  - поля: `name`, `from`, `to`, `occurredAt`
- `GoogleCaughtEvent`:
  - поля: `name`, `playerId`, `playerPoints`, `googlePosition`, `occurredAt`
- `GameFinishedEvent`:
  - поля: `name`, `winnerId`, `status`, `occurredAt`

---

## 4.5 Infrastructure layer

### `EventEmitterBus`

Поля:
- `private readonly eventEmitter = new EventEmitter()`

Методы:
- `publish(event)`
- `on(eventName, callback)` -> возвращает unsubscribe функцию.

### `PostgresGameRepository`

Поля:
- `private readonly databaseUrl`
- `private readonly enabled`
- `private readonly pool?`
- `private schemaReady = false`
- `private readonly inMemorySessions = new Map<string, Game>()`

Публичные методы:
- lifecycle:
  - `onModuleInit()`
  - `onModuleDestroy()`
- repository:
  - `getById(gameId)`
  - `save(gameId, game)`

Private methods:
- `#upsertScore(gameId, playerId, points)`
- `#serializeGame(game)`
- `#restoreGame(state, status)`
- `#restoreScore(game, p1, p2)`
- `#restoreStatus(game, status)`
- `#readStateFromSettingsJson(settingsJson)`
- `#canPersist()`
- `#safeQuery(sql, values)`
- `#safeExec(sql, values)`
- `#handleSchemaError(error)`
- `#checkSchemaReady()`
- `#buildPoolConfig()`

DTO-type внутри инфраструктуры:
- `PersistedGameState` с полями settings/player positions/status/score.

Важный технический нюанс:
- `#restoreStatus` для `Paused` сейчас восстанавливает через `game.stop()`. Это рабочее, но семантически спорное место для будущего рефакторинга.

---

## 4.6 Frontend proxy и runtime API

### `EventEmitter` (`observer/EventEmitter.ts`)

Поля:
- `#subscribers: Record<string, Callback[]>`

Методы:
- `addEventListener`
- `on`
- `subscribe`
- `removeEventListener`
- `off`
- `emit`
- `#unsubscribe`

### `GameRemoteProxy` (`docs/dist/game-remote-proxy.js`)

Поля:
- `eventEmitter`
- `options`
- `socket`
- `api`
- `state` (status/settings/score/player1/player2/google/sessionId/remainingTimeMs/myPlayerId)

Методы:
- lifecycle: `connect`
- command/query API: `start`, `stop`, `finishGame`, `setSettings`, `joinGame`, `movePlayer*`, `getSettings`, `getStatus`, `getPlayer1`, `getPlayer2`, `getGoogle`, `getScore`, `getSnapshot`
- getters: `status`, `player1`, `player2`, `google`, `score`, `settings`
- private: `#mergeState`

### `Api` (inner class)

Поля:
- `socket`
- `pending: Map<requestId, {resolve,reject}>`
- `events: EventEmitter`

Методы:
- `on(eventName, callback)`
- `emitRequest(procedure, payload?)`

Поведение:
- мапит socket events в event emitter;
- закрывает pending promises при disconnect.

---

## 5. Протокол взаимодействия

```mermaid
sequenceDiagram
  participant FE as Frontend
  participant RP as GameRemoteProxy
  participant GW as GameGateway
  participant UC as UseCase
  participant REPO as Repository

  FE->>RP: start()/movePlayer*/stop()
  RP->>GW: socket "request"
  GW->>UC: execute(command)
  UC->>REPO: getById/save
  GW-->>RP: socket "response"
  GW-->>RP: socket "event: change"
  RP-->>FE: EventEmitter "change"
```

RPC процедуры в gateway:
- `joinGame`
- `start`
- `stop`
- `pause`
- `resume`
- `setSettings`
- `getSnapshot`
- `movePlayer1Up/Down/Left/Right`
- `movePlayer2Up/Down/Left/Right`

---

## 6. Тесты: как и зачем они устроены

## 6.1 Unit tests

### `tests/unit/event-emitter.unit.test.ts`

Покрывает:
- доставку payload подписчику (`emit calls subscriber`);
- корректность unsubscribe.

Почему важно:
- этот emitter используется как shared primitive для фронтового event flow.

### `tests/unit/position.unit.test.ts`

Покрывает:
- создание валидной позиции;
- value equality через `equals`;
- перемещение через `move`.

Почему важно:
- Position — фундамент инвариантов движения.

## 6.2 Integration tests

### `tests/integration/game.integration.test.ts`

Покрывает доменную модель `Game`:
- `start()` переводит в `in-progress`;
- движения двух игроков проходят без turn queue;
- catch начисляет очко и сохраняет корректный статус.

Почему важно:
- это проверка бизнес-правил без транспорта.

## 6.3 E2E tests (Playwright)

### `src/test/e2e/game-flow.spec.ts`

Сценарий:
- поднимается backend+frontend через `playwright.config.ts webServer`;
- UI запускает игру;
- через browser-side socket клиент двигает игрока к Google;
- проверяется рост счета в DOM.

Почему важно:
- end-to-end подтверждает связку UI + transport + backend logic.

## 6.4 Legacy e2e test (в проекте присутствует)

### `tests/e2e/websocket.e2e.test.ts`

Файл остался от прежней структуры и импортирует `../../back/server.js`.
Практически в текущем execution path не используется `npm test`/`test:e2e`.

Класс внутри файла: `WsTestClient`.

Поля:
- `ws`
- `pending: Map<requestId, {resolve, reject}>`
- `events: unknown[]`

Методы:
- `open()`
- `request(procedure, payload?)`
- `close()`

Назначение:
- инкапсулирует request/response протокол для websocket e2e сценариев;
- хранит таблицу pending-request до прихода `response`.

Зачем фиксировать в книге:
- чтобы любой инженер сразу видел, что это технический долг, а не активный regression-gate.

---

## 7. Качество кода и служебные процессы

## 7.1 Линтинг (`eslint.config.mjs`)

Чтобы не получать шум по сборочным артефактам, игнорируются:
- `node_modules/**`
- `dist/**`
- `docs/**`
- `img/**`
- `css/**`
- `test-results/**`
- `*.log`
- `back/migrations/**`

Ключевые правила:
- `eqeqeq: error`
- `import/order: warn`
- `@typescript-eslint/consistent-type-imports: warn`
- `no-console: off`

Практическая логика:
- ошибки оставляем только на реально рискованных местах;
- style-предупреждения оставляем как “улучшаем постепенно”.

## 7.2 TypeScript компиляция

- `tsconfig.json`: runtime-compile параметры проекта.
- `tsconfig.build.json`: отдельный профиль для production build.

Смысл разделения:
- тесты и вспомогательные файлы можно исключить из production compile.

## 7.3 Vitest конфигурация

`vitest.config.ts` ограничивает `npm test` только на:
- `tests/unit/**/*.test.ts`
- `tests/integration/**/*.test.ts`

И исключает:
- `tests/e2e/**`
- `src/test/e2e/**`
- `dist/**`

Это устраняет конфликт Vitest с Playwright suites.

## 7.4 Проверка миграций

`scripts/check-migrations.mjs`:
- читает SQL-файл;
- ищет обязательные fragments;
- падает с кодом 1 при несоответствии.

Используется как safety gate до деплоя.

---

## 8. Деплой: GitHub Pages + Render

## 8.1 Frontend deploy на GitHub Pages

Исходник фронта:
- `docs/index.html`
- `docs/dist/*.js`
- `docs/css/*`
- `docs/img/*`

Конфиг URL backend:
- `docs/config.js`
  - localhost -> `http://localhost:3001`
  - production -> `https://catch-the-google-backend.onrender.com`

Практический workflow:
1. обновить frontend ассеты в `docs/`;
2. push в `main`;
3. GitHub Pages раздает статику из ветки/директории.

## 8.2 Backend deploy на Render

`render.yaml`:
- `type: web`
- `runtime: node`
- `buildCommand: npm install && npm run build`
- `startCommand: node dist/main.js`
- `NODE_VERSION: 22`
- env:
  - `DATABASE_URL` (секрет)
  - `NODE_ENV=production`
  - `PORT=10000`
  - `CORS_ORIGIN=*`

```mermaid
flowchart TB
  GH[GitHub repo] --> RND[Render build]
  RND --> CMD1[npm install]
  CMD1 --> CMD2[npm run build]
  CMD2 --> CMD3[node dist/main.js]
  CMD3 --> HC[/health endpoint]
```

## 8.3 Локальный и продовый env

`.env.example` документирует ключи:
- `PORT`
- `NODE_ENV`
- `CORS_ORIGIN`
- `DATABASE_URL`
- legacy optional:
  - `POSTGRES_HOST`
  - `POSTGRES_PORT`
  - `POSTGRES_USER`
  - `POSTGRES_PASSWORD`
  - `POSTGRES_DATABASE`
  - `DB_SSL`
  - `AUTO_RUN_MIGRATIONS`

---

## 9. Полное описание значимых root-файлов

Ниже только значимые файлы корня репозитория (без локальных логов/IDE-файлов).

## 9.1 `.nvmrc`

Содержимое:
- `22`

Значение:
- фиксирует целевую major версию Node.js.

## 9.2 `.env.example`

Ключи и значения по умолчанию:
- `PORT=3001`
- `NODE_ENV=development`
- `CORS_ORIGIN=http://localhost:3000`
- `DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require`
- optional legacy vars пустые/дефолтные.

## 9.3 `.gitignore`

Назначение:
- исключает сборку и локальные артефакты.

Основные записи:
- `node_modules/`
- `dist/` (с исключением `docs/dist`)
- `.env`
- `.idea/`
- тестовые отчеты
- `*.tsbuildinfo`
- `claude_desktop_config.json`

## 9.4 `.codexignore`

Назначение:
- ограничивает контекст для ассистента/инструментов.

Ключевые записи:
- `node_modules`
- `.npm`
- `dist`, `build`
- `.git`
- `*.log`
- `package-lock.json`
- `.vscode`, `.idea`, `.env*`

## 9.5 `AGENTS.md`

Назначение:
- локальные архитектурные инструкции агенту.

Ключевые поля:
- front-matter:
  - `name: catch-the-google-expert`
  - `description: Senior Architect for NestJS Clean Architecture project`
- секции: Project Context, Tech Stack, Layer rules, Naming.

Важно:
- в текущем файле есть упоминание TypeORM/Bloggers Platform; фактический проект использует `pg` и игру Catch The Google.

## 9.6 `TASKS.md`

Назначение:
- план миграции к текущей архитектуре батчами.

Структура:
- Batch 0..7
- критерии готовности
- рекомендуемый порядок запуска пачек

## 9.7 `package.json`

Поля:
- `name: catch-the-google`
- `version: 1.0.0`
- `type: module`
- `private: true`
- `scripts`: build/start/dev/test/lint/check:migrations
- `dependencies`: NestJS, Socket.IO, pg, joi и др.
- `devDependencies`: Vitest, Playwright, ESLint, TypeScript.

Ключевые scripts:
- `build`: `npx nest build`
- `build:ts`: `tsc`
- `start:back`: `node dist/main.js`
- `start:front`: `serve docs -l 3000`
- `test`: `vitest run`
- `test:e2e`: `playwright test`
- `check:migrations`: `node ./scripts/check-migrations.mjs`

## 9.8 `package-lock.json`

Поля верхнего уровня:
- `name`
- `version`
- `lockfileVersion: 3`
- `requires: true`
- `packages` (полное дерево зависимостей)

Назначение:
- детерминированная установка зависимостей через `npm ci`.

## 9.9 `tsconfig.json`

Ключевые поля `compilerOptions`:
- `target: ES2022`
- `module/moduleResolution: NodeNext`
- `rootDir: src`
- `outDir: dist`
- `experimentalDecorators: true`
- `emitDecoratorMetadata: true`
- `strict: false`
- `declaration: true`
- `sourceMap: true`
- `incremental: true`

`include`:
- `src/**/*`

`exclude`:
- `node_modules`, `dist`, `tests`, `vitest.config.ts` и legacy пути.

## 9.10 `tsconfig.build.json`

Поля:
- `extends: ./tsconfig.json`
- `compilerOptions.rootDir: src`
- `compilerOptions.outDir: dist`
- `compilerOptions.types: ["node"]`
- `include: src/**/*.ts`
- `exclude: node_modules, dist, tests, src/test/**/*.ts`

## 9.11 `nest-cli.json`

Поля:
- `$schema: https://json.schemastore.org/nest-cli`
- `collection: @nestjs/schematics`
- `sourceRoot: src`

## 9.12 `eslint.config.mjs`

Секции:
- `ignores`
- базовый `js.configs.recommended`
- rules for JS files
- rules for TS files

Ключевые значения:
- `eqeqeq: ["error", "always"]`
- `import/order: warn`
- TS-specific warnings for type imports.

## 9.13 `vitest.config.ts`

Поля:
- `test.include`: unit + integration
- `test.exclude`: e2e + dist
- `environment: node`
- `fileParallelism: false`
- `testTimeout: 10000`

## 9.14 `playwright.config.ts`

Поля:
- `testDir: ./src/test/e2e`
- `timeout: 60000`
- `use.headless: true`
- `webServer[0]`: backend (`npm run build && npm run start:back`, `port 3001`)
- `webServer[1]`: frontend (`npm run start:front`, `port 3000`)

## 9.15 `render.yaml`

Поля сервиса:
- `type: web`
- `name: catch-the-google-backend`
- `runtime: node`
- `plan: free`
- `autoDeploy: true`
- `buildCommand: npm install && npm run build`
- `startCommand: node dist/main.js`
- env vars:
  - `NODE_VERSION: 22`
  - `DATABASE_URL` (`sync: false`)
  - `NODE_ENV: production`
  - `PORT: 10000`
  - `CORS_ORIGIN: *`

## 9.16 `README.md` и `README.en.md`

Назначение:
- продуктовая и техническая документация на двух языках.
- структура синхронизирована, отличается только язык.

---

## 10. Декомпозиция по принципу «чтобы получить X, делаем Y»

- Чтобы обеспечить ход игрока:
  - пишем `Game.move(...)` в агрегате;
  - в `Player.move(...)` проверяем занятость;
  - оборачиваем в `MovePlayerUseCase.execute(...)`;
  - из `GameGateway.onRequest` маршрутизируем RPC `movePlayer*`.

- Чтобы обеспечить начисление очков:
  - пишем `Game.catch(...)`;
  - создаем `GoogleCaughtEvent`;
  - публикуем event из use case через `IEventBus`;
  - пушим новый snapshot через `emitChange`.

- Чтобы обеспечить restart/stop-сценарий:
  - в `Game.stop()` сбрасываем позиции/очки/статус;
  - `StopGameUseCase` сохраняет агрегат.

- Чтобы обеспечить pause/resume:
  - `Game.pause()/resume()` меняют статус только в допустимых переходах;
  - `PauseGameUseCase`/`ResumeGameUseCase` сохраняют и транслируют состояние;
  - gateway дает RPC endpoint.

- Чтобы обеспечить устойчивость без БД:
  - `PostgresGameRepository` хранит `inMemorySessions`;
  - SQL ветка включается только при валидной схеме и `DATABASE_URL`.

- Чтобы обеспечить предсказуемые релизы:
  - `check:migrations` валидирует SQL;
  - `lint`, `build:ts`, `test`, `test:e2e` фиксируют регрессии.

---

## 11. Схемы, полезные для обучения

### 11.1 Классы backend-модуля

```mermaid
classDiagram
  class GameGateway {
    -server
    -clientRoles
    -playerOwners
    -defaultGameId
    +handleConnection()
    +handleDisconnect()
    +onRequest()
    -emitChange()
    -assignRole()
    -ensureGameExists()
  }

  class StartGameUseCase
  class MovePlayerUseCase
  class StopGameUseCase
  class PauseGameUseCase
  class ResumeGameUseCase
  class SetSettingsUseCase
  class GetSnapshotQueryHandler

  class Game {
    -settings
    -player1
    -player2
    -domainEvents
    -googlePosition
    -status
    +move()
    +catch()
    +start()
    +stop()
    +pause()
    +resume()
    -directionToDelta()
    -buildDefaultPositions()
    -normalizePositionsForGrid()
  }

  class Player
  class Position
  class GooglePositionDomainService
  class EventEmitterBus
  class PostgresGameRepository

  GameGateway --> StartGameUseCase
  GameGateway --> MovePlayerUseCase
  GameGateway --> StopGameUseCase
  GameGateway --> PauseGameUseCase
  GameGateway --> ResumeGameUseCase
  GameGateway --> SetSettingsUseCase
  GameGateway --> GetSnapshotQueryHandler

  MovePlayerUseCase --> Game
  StartGameUseCase --> Game
  PauseGameUseCase --> Game
  ResumeGameUseCase --> Game
  StopGameUseCase --> Game
  SetSettingsUseCase --> Game

  Game --> Player
  Game --> Position
  Game --> GooglePositionDomainService
```

### 11.2 Деплойная цепочка

```mermaid
flowchart LR
  DEV[Developer] --> GIT[GitHub main]
  GIT --> PAGES[GitHub Pages: docs/]
  GIT --> RENDER[Render: backend]
  RENDER --> NEON[(Neon PostgreSQL)]
  PAGES --> USERS[Browsers]
  USERS -->|Socket.IO| RENDER
```

---

## 12. Что инженер должен помнить при развитии проекта

1. Domain-first: не тянуть socket/sql в `domain`.
2. Любое новое действие игры — отдельный use case.
3. Любой новый transport payload — через mapper/DTO, а не ad-hoc объект в gateway.
4. Новые таблицы/поля — сначала SQL migration + `check:migrations` update.
5. Тесты:
   - unit для value objects и локальных правил;
   - integration для сценариев агрегата;
   - e2e для клиент-серверного поведения.
6. README ru/en держать синхронно по структуре.

---

## 13. Финальная оценка текущего состояния проекта

Сильные стороны:
- чистое разделение по слоям;
- понятные use case boundaries;
- рабочий realtime flow;
- deploy-ready конфигурация для Pages/Render;
- тестовый каркас покрывает основные уровни.

Ограничения/техдолг:
- UI пока не использует backend `pause/resume` (только API готово).
- В репозитории есть legacy-тест `tests/e2e/websocket.e2e.test.ts` с устаревшим импортом.
- Есть lint warnings по `import/order`/`consistent-type-imports`.
- Файл `AGENTS.md` содержит частично неактуальные для проекта тезисы (TypeORM, Bloggers Platform).

Рекомендуемые следующие шаги:
1. Добавить UI-кнопку `PAUSE/RESUME` + обработчик в frontend.
2. Либо адаптировать, либо удалить legacy websocket e2e тест.
3. Убрать lint warnings автоправкой и точечным рефакторингом импортов.
4. Синхронизировать `AGENTS.md` с реальным стеком (`pg`, game domain).

---

## 14. Команды эксплуатации (короткий справочник)

```bash
npm install
npm run build
npm run start:back
npm run start:front

npm run lint
npm run build:ts
npm run check:migrations
npm test
npm run test:e2e
```

Это минимальный operational набор для ежедневной разработки и релизной проверки.
