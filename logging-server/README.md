# Flowerpil Logging Server

Self-contained ingestion API and lightweight UI for reviewing tester feedback that flows out of the Flowerpil application.

## Features
- Accepts batched feedback payloads at `POST /ingest/feedback`.
- Provides filterable tables at `GET /api/feedback` and a static UI (`public/index.html`).
- Optionally proxies log lookups back to Flowerpil with `LOG_SOURCE_BASE_URL`.
- Stores data in SQLite (`better-sqlite3`) with WAL enabled for durability.

## Getting Started
```bash
git clone https://github.com/flowerpil/logging-server.git
cd logging-server
cp .env.example .env            # adjust to your environment
npm install --production        # or npm install
npm start
```

Visit `http://localhost:4600` to open the UI. The API exposes:

| Method | Path                     | Notes |
| ------ | ----------------------- | ----- |
| POST   | `/ingest/feedback`      | Accepts `{ entries: [...] }` batches |
| GET    | `/api/feedback`         | Supports pagination and filtering |
| GET    | `/api/feedback/:id/logs`| Requires `LOG_SOURCE_BASE_URL` to be set |
| DELETE | `/api/feedback`         | Clears table or records before a timestamp |
| GET    | `/health`               | Basic health check |

## Environment Variables
| Name | Description |
| ---- | ----------- |
| `PORT` | Port the server listens on (defaults to `4600`). |
| `LOGGING_DB_PATH` | Path to SQLite DB. Defaults to `./data/logging.db` next to the server. Relative paths resolve from the process cwd. |
| `LOGGING_SERVICE_KEY` | Optional shared secret forwarded to Flowerpil when fetching correlated logs. |
| `LOG_SOURCE_BASE_URL` | Flowerpil API base used for `/api/feedback/:actionId/logs`. Leave blank to disable log proxying. |

`.env` loading happens automatically on start. Override with `LOGGING_ENV_PATH=/custom/path/.env npm start`.

## Deployment
1. Copy the `logging-server` directory into its own repository or push this package directly.
2. On the Ubuntu host, clone and install:
   ```bash
   git clone <your-logging-server-repo> /opt/logging-server
   cd /opt/logging-server
   npm install --production
   cp .env.example .env  # tweak values, especially LOGGING_DB_PATH and LOG_SOURCE_BASE_URL
   npm start
   ```
3. (Optional) Use PM2 or systemd:
   ```bash
   pm2 start npm --name flowerpil-logging -- start
   pm2 save
   ```
   You can also adapt `ecosystem.config.cjs` included in this directory.
4. Point NGINX at `localhost:<PORT>`; TLS can be terminated at the proxy (see `infra/nginx/fb.fpil.xyz.conf` in the Flowerpil repo for reference).

Backups are straightforward: copy the SQLite file configured by `LOGGING_DB_PATH`.
