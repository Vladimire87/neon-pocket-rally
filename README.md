# Neon Pocket Rally

Ретро-гонка для Telegram Web App: монохромный handheld-vibe, polished HUD, локальный high score, локальный leaderboard и готовый слой под облачную таблицу результатов.

## Что внутри

- HTML5 Canvas игра без сборки и тяжёлых зависимостей
- стартовый экран, HUD, game over, restart
- управление с клавиатуры и touch-кнопок
- рост сложности по времени и по скорости потока
- localStorage для high score и локальной доски рекордов
- минимальная интеграция Telegram WebApp API
- deploy-ready как статический сайт
- заготовка под cloud leaderboard через JSON endpoints

## Структура

```text
index.html
src/
  main.js
  styles.css
public/
  leaderboard-config.json
```

## Локальный запуск

### Вариант 1

```bash
cd neon-pocket-rally
python3 -m http.server 4173
```

Открыть: `http://localhost:4173`

### Вариант 2

```bash
cd neon-pocket-rally
npm run dev
```

## Telegram Web App интеграция

1. Залить проект на любой статический хостинг:
   - GitHub Pages
   - Vercel Static
   - Netlify
   - Cloudflare Pages
2. Убедиться, что сайт открывается по HTTPS.
3. В BotFather:
   - `@BotFather`
   - `/newapp` или привязка Web App button к существующему боту
   - указать HTTPS URL приложения
4. Открывать игру из кнопки бота или через inline keyboard `web_app`.

### Что уже делает интеграция

- `Telegram.WebApp.ready()`
- `expand()` для fullscreen-like режима
- чтение `initDataUnsafe.user.first_name` для имени игрока
- haptic feedback на crash / submit score
- `sendData()` с финальным score, чтобы бот мог принять результат

Пример полезной обработки на стороне бота:

```json
{"type":"score","score":1840}
```

## Leaderboard

### Что готово сейчас

- локальный high score обязателен и уже работает
- локальная доска рекордов сохраняется в `localStorage`
- интерфейс умеет смешивать local + remote записи

### Как подключить облачную таблицу

Заполнить `public/leaderboard-config.json`:

```json
{
  "fetchUrl": "https://your-endpoint.example.com/api/leaderboard",
  "submitUrl": "https://your-endpoint.example.com/api/leaderboard"
}
```

Ожидаемый формат чтения:

```json
{
  "entries": [
    { "name": "Vlad", "score": 2100 },
    { "name": "Mira", "score": 1890 }
  ]
}
```

Ожидаемый формат записи `POST`:

```json
{
  "name": "Vladimir",
  "score": 2100,
  "telegramId": 123456,
  "authDate": 1234567890
}
```

### Самый быстрый serverless-вариант

Подойдёт любой JSON-friendly backend:

- Cloudflare Workers + KV / D1
- Vercel Functions + KV / Blob / Postgres
- Netlify Functions + Supabase
- Google Sheets через Apps Script, если нужен быстрый MVP

Логика простая:
1. `GET /api/leaderboard` → вернуть top N
2. `POST /api/leaderboard` → валидировать имя и score, записать результат
3. Отсортировать по `score desc`, отдавать top 8-20

## Деплой

Так как это статический проект без сборки, можно деплоить как есть.

### GitHub Pages

- создать repo
- залить содержимое проекта
- включить Pages на ветке `main`
- если нужен корень, положить всё в root repo как сейчас

### Vercel / Netlify / Cloudflare Pages

- import existing repo
- build command: пусто
- output dir: `.`

## Управление

- `← / →` или `A / D` — руль
- `Space / Enter` — старт / рестарт
- touch-кнопки снизу — для Telegram и mobile

## Что можно улучшить потом

- настоящая серверная leaderboard с anti-cheat валидацией
- daily runs / seasons
- звуки и chiptune music
- более сложные паттерны трафика
- Telegram cloud storage / user avatar / share card
