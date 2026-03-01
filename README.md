# Catch The Google

Мультиплеер-игра на WebSocket с разделением на слои `UI -> Controller -> Domain`.

## Что реализовано

- Общая игровая логика в `game.js` (без зависимостей от браузера)
- Синхронизация двух браузеров через WebSocket (`back/server.js`)
- Remote Proxy на фронте (`game-remote-proxy.js`) с таким же интерфейсом, как у доменной модели
- Готовая вёрстка подключена как presentation layer (`index.html`, `css/*`)
- Поддержка ролей: `Player 1`, `Player 2`, `Spectator`
- Перемещение Google каждые N мс
- Ограничения по клеткам (игроки не пересекаются, выход за границы запрещён)
- Подсчёт очков, завершение матча по `pointsToWin` или по таймеру
- Опциональная запись матча в Neon PostgreSQL

## Архитектура

- `front.js` — Controller/UI orchestration
- `game-remote-proxy.js` — Remote Proxy + WebSocket API
- `game.js` — Domain/BLL
- `observer/EventEmitter.js` — событийная шина
- `back/server.js` — WebSocket backend + маршрутизация процедур
- `back/db.js` — DAL для PostgreSQL
- `back/migrations/001_init_2.sql` — SQL-миграция

## Важное правило по БД

Все сущности в PostgreSQL имеют суффикс `_2`:

- `players_2`
- `game_sessions_2`
- `game_events_2`
- `scores_2`

## Локальный запуск

1. Установить зависимости:

```bash
npm install
```

2. Запустить backend:

```bash
npm run start:back
```

3. Запустить frontend (в отдельном терминале):

```bash
npm run start:front
```

4. Открыть в браузере `http://localhost:3000`.

## Переменные окружения

Скопируйте `.env.example` в `.env` (только для backend):

```env
PORT=3001
DATABASE_URL=postgresql://...
DB_SSL=enable
```

Если `DATABASE_URL` не задан, игра всё равно работает (состояние в памяти).

## Деплой frontend (GitHub Pages)

1. Запушить репозиторий на GitHub.
2. Включить `Settings -> Pages -> Deploy from branch`.
3. Выбрать ветку `main` и корень `/`.
4. В файле `config.js` указать URL backend на Render:

```js
window.GAME_WS_URL = "wss://<your-render-service>.onrender.com";
```

## Деплой backend (Render)

Вариант A (рекомендуется): через `render.yaml` (Blueprint)

1. В Render выбрать `New + -> Blueprint`.
2. Указать репозиторий с проектом.
3. Render автоматически подхватит `render.yaml`.
4. В переменные сервиса добавить `DATABASE_URL` (из Neon).
5. Если репозиторий содержит несколько папок, укажите `Root Directory = CatchTheGoogle`.

Вариант B: ручная настройка `Web Service`

1. Создать `Web Service` из этого репозитория.
2. Build command:

```bash
npm install
```

3. Start command:

```bash
npm run start:back
```

4. Добавить env:

- `PORT` не задавать вручную (Render подставит сам)
- `DATABASE_URL=<ваш Neon URL>`
- `DB_SSL=enable`

5. Проверить health endpoint: `https://<service>.onrender.com/health`
6. Скопировать публичный `wss://...onrender.com` URL в `config.js` фронтенда.

## Комментарии в коде

Ключевые участки с пояснениями на русском:

- WebSocket event-broadcast и request/response — `back/server.js`
- Критичная бизнес-логика перемещения/поимки — `game.js`
- Обработка ошибок запуска на фронте — `front.js`

## Текущее ограничение

- Один общий матч на сервер (одна игровая сессия в момент времени). Для портфолио этого достаточно, но можно расширить до нескольких комнат.

