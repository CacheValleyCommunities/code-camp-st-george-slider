# CodeCamp 2025 Event Display

Sponsor display, remote media controls, and a live quiz for CodeCamp. The room display and the quiz are public. The control room requires an account.

## Access

- `/` — room display. Public.
- `/game` — quiz. Public websocket. Players do not create accounts; the server assigns a name.
- `/login` and `/admin` — control room. Sign in as `brent@codecamp.com` with password `password`. That admin is created on startup when the email is missing. Admins can add staff or more admins. Staff can run the show and cannot add users.
- `/setup` — create the first admin by hand. Available only while the database has no users, which is the test databases and a failed seed.

Sessions last 24 hours, are stored in SQLite, and are sent as an HttpOnly cookie. Control-room actions travel on `/ws/admin` and are rejected when the session is gone. Game clients use `/ws/game` and can only join and answer. The display uses `/ws/display` and only receives commands.

## Tech stack

- Go HTTP router (`chi`)
- HTML templates
- Gorilla WebSockets
- GORM with SQLite
- bcrypt passwords

## Run locally

Go 1.26 or newer:

```bash
go run ./cmd/server
```

Open `http://localhost:3000/login` and sign in as `brent@codecamp.com` with password `password`. The database is created at `data/codecamp.db`.

```bash
go test ./...
```

`PORT` defaults to `3000`. `DATA_DIR` defaults to `data`. `APP_ROOT` defaults to the working directory.

## Docker

```bash
docker compose up -d
```

The app listens on `http://localhost:3000`. Accounts persist in the `codecamp-data` volume.

For a rebuild after Go changes, run `docker compose up -d --build`. Template and asset mounts for local iteration:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

## Project layout

```
cmd/server/            # process entrypoint
internal/auth/         # users, sessions, bcrypt
internal/realtime/     # public game socket and admin commands
internal/logos/        # sponsor logo records and files
internal/web/          # router, pages, CSRF
templates/             # display, quiz, login, setup, control room
public/                # CSS, JS, images
data/                  # SQLite database and uploaded logos
```

## Sponsor logos

Upload logos from the control room. Each file is stored as a PNG in `data/logos` with a GUID filename. The record stores the event it belongs to and how many whole seconds it stays on screen. The display rotates the logos for the current event title.

Images already in `logos/platinum`, `logos/gold`, `logos/silver`, and `logos/bronze` are imported once, while the logo table is still empty. PNG, JPG, JPEG, and GIF are imported. SVG and WEBP are skipped, and the original files stay in place.

## Event dates

The countdown, event title, Wi-Fi line, and ticker are edited in the control room. They are stored in the local SQLite database, and an open display updates when you save.

## Quiz content

Edit `public/js/game-data.js`. The server reads that file at startup and never sends the `correct` flags to players.

## Control room

Signed-in staff can show video, images, and text, upload sponsor logos, edit the event title, Wi-Fi line, countdown, and ticker, play YouTube audio on the display, send notifications, and start or stop a quiz. Admins also add and remove dashboard users from the bottom of `/admin`. Removing the last admin is rejected, and you cannot remove yourself.
