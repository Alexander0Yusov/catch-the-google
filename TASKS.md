# План миграции к Clean Architecture (DDD) для CatchTheGoogle

Цель: перевести текущую реализацию из плоской структуры (`game.ts`, `back/server.ts`, `back/db.ts`) в модульную архитектуру по `AGENTS.md` с четкими слоями `Domain / Application / Infrastructure` (и тонким Interface).

Статус на сейчас:

- Папка `src/modules` отсутствует.
- Доменная логика смешана с оркестрацией таймеров и внешними событиями в `game.ts`.
- WebSocket и persistence напрямую вызывают домен.

Ниже план разбит на пачки, которые можно выполнять последовательно и независимо деплоить/мержить.

---

## Batch 0. Подготовка каркаса модулей

### 0.1 Создать модульную структуру

- [ ] Создать `src/modules/game/domain`.
- [ ] Создать `src/modules/game/application/usecases`.
- [ ] Создать `src/modules/game/application/mappers`.
- [ ] Создать `src/modules/game/application/contracts` (порты/интерфейсы).
- [ ] Создать `src/modules/game/infrastructure`.
- [ ] Создать `src/modules/game/infrastructure/query`.
- [ ] Создать `src/modules/game/interface` (ws-controller/handlers).

### 0.2 Базовые соглашения и индексы

- [ ] Ввести kebab-case для новых файлов.
- [ ] Сделать barrel-файлы (`index.ts`) по слоям.
- [ ] Добавить `README` в `src/modules/game` с границами слоев.

### Критерий готовности

- [ ] Структура `src/modules/game/*` создана.
- [ ] Сборка проходит без удаления старого кода (подготовительный слой).

---

## Batch 1. Domain слой (ядро игры без инфраструктуры)

### 1.1 Value Objects и Entities

- [ ] Перенести/адаптировать `Position`, `Player`, `Google`, `Unit` в `src/modules/game/domain`.
- [ ] Добавить `GameSettings` как Value Object с валидацией (`gridSize`, `pointsToWin`, `turnDelayMs`, `googleJumpInterval`, `gameDurationMs`).
- [ ] Добавить `Score`/`GameScore` как отдельный domain-объект.

### 1.2 Aggregates и доменные правила

- [ ] Выделить `GameSession` (Aggregate Root), который хранит:
  - статус,
  - позиции юнитов,
  - счет,
  - очередь ходов,
  - startedAt/sessionId.
- [ ] Перенести правила из `game.ts` в методы aggregate:
  - валидность хода (границы, занятость),
  - поимка Google,
  - смена активного игрока,
  - завершение игры по очкам/таймауту.
- [ ] Убрать из домена прямые `setInterval/setTimeout` (домен должен быть детерминированным).

### 1.3 Domain Events

- [ ] Ввести domain events:
  - `game-started.event.ts`,
  - `player-moved.event.ts`,
  - `google-caught.event.ts`,
  - `google-jumped.event.ts`,
  - `game-finished.event.ts`.
- [ ] Реализовать накопление событий внутри aggregate (без transport-зависимостей).

### 1.4 Domain сервисы

- [ ] Вынести генерацию случайной клетки в доменный сервис/порт (`random-position.service.ts` + интерфейс RNG).
- [ ] Вынести политику выбора новой позиции Google (с учетом fallback при маленьком поле).

### Критерий готовности

- [ ] Domain не импортирует ничего из `back/`, `ws`, `pg`, `observer`, `node:*`.
- [ ] Правила игры полностью покрыты unit-тестами домена.

---

## Batch 2. Application слой (use cases + DTO + mappers)

### 2.1 Контракты (Ports)

- [ ] Создать интерфейсы в `application/contracts`:
  - `game-session.repository.ts` (command repository),
  - `game-events.repository.ts`,
  - `score.repository.ts`,
  - `game-query.repository.ts` (для query-представлений),
  - `game-clock.port.ts` (время),
  - `game-timer.port.ts` (таймеры),
  - `event-bus.port.ts`.

### 2.2 Use Cases (каждое действие отдельным классом)

- [ ] Реализовать use cases (`*.usecase.ts`):
  - `start-game.usecase.ts`
  - `stop-game.usecase.ts`
  - `pause-game.usecase.ts`
  - `resume-game.usecase.ts`
  - `finish-game.usecase.ts`
  - `set-settings.usecase.ts`
  - `join-game.usecase.ts`
  - `move-player.usecase.ts` (или 4 специализированных use case по направлению)
  - `google-jump-tick.usecase.ts` (обработка тика таймера)
  - `game-finish-tick.usecase.ts` (завершение по времени)

### 2.3 Query handlers

- [ ] Реализовать query-handlers (`*.query-handler.ts`):
  - `get-settings.query-handler.ts`
  - `get-status.query-handler.ts`
  - `get-snapshot.query-handler.ts`
  - `get-score.query-handler.ts`
  - `get-player.query-handler.ts`

### 2.4 DTO и мапперы

- [ ] Создать мапперы в `application/mappers`:
  - `game-snapshot-to-view.map.ts`
  - `score-to-view.map.ts`
  - `position-to-view.map.ts`
  - `game-event-to-ws.map.ts`
- [ ] Вынести текущий формат ответа WS в mapper (чтобы контроллер не собирал payload вручную).

### Критерий готовности

- [ ] Вся бизнес-оркестрация выполняется через `usecase.execute()`.
- [ ] Контроллеры используют только use cases/query handlers, без прямого доступа к домену.

---

## Batch 3. Infrastructure слой (Postgres, таймеры, event bus)

### 3.1 Persistence repositories

- [ ] Реализовать command-репозитории в `infrastructure`:
  - `game-session.repository.ts`
  - `game-events.repository.ts`
  - `scores.repository.ts`
- [ ] Перенести SQL из `back/db.ts` в соответствующие репозитории.
- [ ] Сохранить fallback-логику при отсутствии таблиц `_2` как инфраструктурную политику.

### 3.2 Query repository

- [ ] Создать `infrastructure/query/game-query.repository.ts`.
- [ ] Реализовать выборки для snapshot/истории/очков (минимум то, что нужно текущему WS API).

### 3.3 Таймеры и время

- [ ] Реализовать адаптеры портов:
  - `node-clock.adapter.ts`
  - `node-timer.adapter.ts`
- [ ] Таймер Google (`googleJumpInterval`) и timeout матча (`gameDurationMs`) запускать через Application-порты, а не из domain.

### 3.4 Event bus адаптер

- [ ] Реализовать инфраструктурный `event-bus` адаптер над текущим `observer/EventEmitter`.
- [ ] Обеспечить публикацию domain events в WS-подписчиков и persistence listeners.

### Критерий готовности

- [ ] `pg` и Node API используются только в `infrastructure`.
- [ ] `back/db.ts` либо удален, либо превращен в thin adapter/компоновщик.

---

## Batch 4. Interface слой (WS/HTTP контроллеры как thin layer)

### 4.1 WS controller

- [ ] Создать `src/modules/game/interface/game-ws.controller.ts`.
- [ ] Вынести обработку `request`/`response` и `joinGame` role-logic из `back/server.ts` в контроллер/handler классы.
- [ ] Оставить в controller только:
  - валидацию входного DTO,
  - вызов use case/query handler,
  - отправку mapped ответа.

### 4.2 Procedure handlers

- [ ] Разнести процедуры по handler-файлам (kebab-case):
  - `start-game.procedure-handler.ts`
  - `move-player.procedure-handler.ts`
  - `set-settings.procedure-handler.ts`
  - `join-game.procedure-handler.ts`
  - `get-snapshot.procedure-handler.ts`

### 4.3 HTTP endpoints

- [ ] `GET /health` оставить в thin HTTP controller.
- [ ] `api-docs` / `ws-docs` вынести в отдельный interface helper без доступа к domain.

### Критерий готовности

- [ ] `back/server.ts` становится entrypoint + dependency wiring.
- [ ] Логика игры отсутствует в transport-слое.

---

## Batch 5. DI-композиция и модульная сборка

### 5.1 Composition Root

- [ ] Создать `src/app/bootstrap` (или `src/main.ts`) для сборки зависимостей.
- [ ] Подключить репозитории, use cases, query handlers, controller через constructor DI.
- [ ] Ввести токены провайдеров (для легкой замены in-memory / postgres реализации).

### 5.2 Конфигурация

- [ ] Централизовать env-конфиг (`database`, `timers`, `ports`, `AUTO_RUN_MIGRATIONS`, `DB_SSL`).
- [ ] Добавить валидацию конфигурации на старте.

### Критерий готовности

- [ ] Приложение стартует через единый composition root.
- [ ] Смена инфраструктуры не требует правок domain/application.

---

## Batch 6. Тесты по слоям и безопасная миграция

### 6.1 Unit tests (Domain)

- [ ] Портировать текущие unit/integration проверки правил в domain-тесты.
- [ ] Добавить тесты на domain events и крайние случаи (минимальное поле, недоступные клетки, tie по времени).

### 6.2 Application tests

- [ ] Тесты use cases через mock ports (репозитории/таймеры/event bus).
- [ ] Проверка, что каждый use case вызывает правильные порты и мапперы.

### 6.3 Infrastructure tests

- [ ] Интеграционные тесты SQL-репозиториев.
- [ ] Тесты fallback режима (schema missing -> persistence disabled).

### 6.4 E2E

- [ ] Обновить e2e для новой interface-композиции без изменения протокола.
- [ ] Проверить обратную совместимость фронта (`game-remote-proxy.ts`).

### Критерий готовности

- [ ] Все тесты проходят: `unit + integration + e2e`.
- [ ] Поведение протокола WS для клиента не изменилось (или задокументировано versioning).

---

## Batch 7. Завершение миграции и уборка legacy

### 7.1 Депрекация старых файлов

- [ ] Удалить/заархивировать legacy-файлы после переноса:
  - `game.ts` (или оставить как facade до полного cut-over),
  - `back/db.ts` (после замены на repo-слой),
  - фрагменты business logic из `back/server.ts`.

### 7.2 Документация

- [ ] Обновить `README.md` и `README.en.md` под новую структуру `src/modules/game/*`.
- [ ] Обновить архитектурные диаграммы (слои, зависимости, flow событий).
- [ ] Добавить в `AGENTS.md` project-specific note (если решишь держать его синхронным с реальным проектом игры).

### 7.3 Критерии релиза

- [ ] Нет прямых импортов `infrastructure -> domain` в обратную сторону.
- [ ] Нет вызовов SQL/WS из use cases.
- [ ] Все входные действия проходят через `*.usecase.ts`.
- [ ] Query логика вынесена в `infrastructure/query/*-query.repository.ts` и `*.query-handler.ts`.

---

## Рекомендуемый порядок запуска пачек

1. Batch 0 + Batch 1 (каркас + чистый домен)
2. Batch 2 (application-usecases + mappers)
3. Batch 3 (infrastructure repositories + timers)
4. Batch 4 (interface/ws-controller)
5. Batch 5 (DI wiring)
6. Batch 6 (полный прогон тестов)
7. Batch 7 (удаление legacy + документация)

---

## Практический режим выполнения (чтобы запускать пачками)

### Пачка A (без риска для протокола)

- Batch 0
- Batch 1
- Частично Batch 2 (только query/getSnapshot)

Ожидаемый результат:

- новый домен и use cases созданы,
- старый сервер еще работает.

### Пачка B (подключение инфраструктуры)

- Остальной Batch 2
- Batch 3
- Частично Batch 5

Ожидаемый результат:

- use cases работают через порты,
- Postgres и таймеры подключены адаптерами.

### Пачка C (ввод в прод-поток)

- Batch 4
- Остальной Batch 5
- Batch 6

Ожидаемый результат:

- WS controller переключен на use cases,
- тесты подтверждают обратную совместимость.

### Пачка D (финализация)

- Batch 7

Ожидаемый результат:

- legacy удален,
- документация и архитектура синхронизированы.
