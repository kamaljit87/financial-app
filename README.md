# DebtWise — Personal Credit Card Debt Tracker

A production-ready, privacy-first financial tracker that runs entirely on your local machine. No cloud, no third-party APIs, no data leaving your device.

## Features

- **Dashboard** — Total debt, income, expenses, cash flow, utilization, health score
- **Credit Cards** — Track multiple cards with utilization, due dates, interest rates
- **Transactions** — Manual entry with categories, tags, pagination, filters
- **Income Tracking** — Salary, freelance, bonus, side income with monthly trends
- **Financial Insights** — Smart alerts, health score, debt payoff projections
- **Reports & Export** — CSV and XLSX export, database backups
- **Security** — bcrypt password hashing, JWT auth, rate limiting, account lockout, audit logs

---

## Quick Start

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- No other dependencies needed

### 1. Clone / Download the project

```bash
cd /path/to/financial-app
```

### 2. Generate a strong JWT secret

```bash
openssl rand -base64 64
```

Copy the output and update `.env`:

```env
JWT_SECRET=<your-generated-secret>
```

### 3. Start the application

```bash
docker compose up -d --build
```

This builds both containers and starts the app. First build takes ~2–3 minutes.

### 4. Open the app

Navigate to: **http://localhost:3000**

On first visit, you'll be prompted to create your admin account (one-time setup).

### 5. Stop the app

```bash
docker compose down
```

Your data persists in `./data/debtwise.db`.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `APP_PORT` | `3000` | Port to access the app |
| `JWT_SECRET` | *(change this!)* | Secret for signing JWT tokens |
| `JWT_EXPIRES_IN` | `24h` | Session duration (e.g. `24h`, `7d`, `30d`) |
| `FRONTEND_URL` | `http://localhost:3000` | Frontend URL (CORS) |
| `DATA_PATH` | `./data` | Host path for SQLite database |
| `LOG_LEVEL` | `info` | Log level (`info`, `debug`, `warn`, `error`) |

---

## Project Structure

```
financial-app/
├── backend/
│   ├── src/
│   │   ├── index.js              # Express app entry point
│   │   ├── models/
│   │   │   └── database.js       # SQLite schema & connection
│   │   ├── routes/
│   │   │   ├── auth.js           # Login, register, session
│   │   │   ├── cards.js          # Credit card CRUD
│   │   │   ├── transactions.js   # Transaction CRUD
│   │   │   ├── income.js         # Income CRUD
│   │   │   ├── dashboard.js      # Dashboard aggregations
│   │   │   ├── insights.js       # Financial health engine
│   │   │   ├── export.js         # CSV/XLSX export
│   │   │   └── backup.js         # Database backup
│   │   ├── middleware/
│   │   │   ├── auth.js           # JWT verification
│   │   │   ├── validate.js       # Request validation
│   │   │   └── errorHandler.js   # Global error handler
│   │   └── utils/
│   │       ├── logger.js         # Winston logging
│   │       └── audit.js          # Audit log helper
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.js                # Routes
│   │   ├── context/
│   │   │   └── AuthContext.js    # Auth state
│   │   ├── services/
│   │   │   └── api.js            # Axios client
│   │   ├── pages/
│   │   │   ├── Dashboard.js
│   │   │   ├── Cards.js
│   │   │   ├── Transactions.js
│   │   │   ├── Income.js
│   │   │   ├── Insights.js
│   │   │   ├── Reports.js
│   │   │   └── Settings.js
│   │   └── components/
│   │       ├── layout/           # Sidebar, Header, Layout
│   │       └── ui/               # LoadingScreen, etc.
│   ├── nginx.conf                # Nginx config with security headers
│   └── Dockerfile
├── data/                         # SQLite database (auto-created)
├── docker-compose.yml
├── .env                          # Your local config (not committed)
├── .env.example                  # Template
└── README.md
```

---

## Database Schema

The SQLite database contains:

| Table | Purpose |
|---|---|
| `users` | Admin account with hashed password |
| `audit_logs` | Auth event log (login, logout, failures) |
| `credit_cards` | Cards with last 4 digits only |
| `transactions` | All spending/payment entries |
| `income_entries` | Salary, freelance, other income |
| `budgets` | Monthly budget targets |
| `goals` | Debt reduction goals |
| `settings` | User preferences (currency, thresholds) |

---

## Security

- **Passwords**: Hashed with bcrypt (12 rounds)
- **Sessions**: JWT with configurable expiry
- **Lockout**: Account locked for 30 minutes after 5 failed login attempts
- **Rate limiting**: 10 auth attempts per 15 minutes; 500 global requests per 15 minutes
- **Card data**: Only last 4 digits stored — full card numbers never entered or stored
- **Headers**: Helmet.js for security headers (CSP, HSTS, X-Frame-Options, etc.)
- **SQL injection**: All queries use parameterized statements via better-sqlite3
- **Audit log**: Every login, logout, and auth failure is logged with IP and timestamp
- **Local only**: No network calls to external services; CORS restricted to localhost

---

## Backup & Restore

### Create a backup (via UI)
Go to **Reports → Create Backup**

### Create a backup (via CLI)
```bash
docker exec debtwise-backend wget -O- http://localhost:3001/api/backup/create
```

### Manual backup
```bash
cp ./data/debtwise.db ./data/debtwise-backup-$(date +%Y%m%d).db
```

### Restore
Stop the containers, replace `./data/debtwise.db` with your backup, restart.

```bash
docker compose down
cp /path/to/backup.db ./data/debtwise.db
docker compose up -d
```

---

## Useful Commands

```bash
# Start
docker compose up -d --build

# Stop
docker compose down

# View logs
docker compose logs -f backend
docker compose logs -f frontend

# Restart backend only
docker compose restart backend

# Access SQLite database directly
docker exec -it debtwise-backend sh -c "sqlite3 /data/debtwise.db"

# Check backend health
curl http://localhost:3001/api/health
```

---

## Security Recommendations for Self-Hosting

1. **Change JWT_SECRET** before first run — use `openssl rand -base64 64`
2. **Do not expose port 3000 to the internet** — bind to `127.0.0.1` only if needed
3. **Keep regular backups** — use the built-in backup feature weekly
4. **Use full-disk encryption** on your laptop to protect the SQLite database at rest
5. **Keep Docker and your OS updated**

---

## Troubleshooting

**Port already in use:**
```bash
# Change APP_PORT in .env to another port (e.g. 3001)
APP_PORT=3001
docker compose up -d
```

**Database not persisting:**
Ensure `./data/` directory exists and is writable.
```bash
mkdir -p ./data && chmod 755 ./data
```

**Container won't start:**
```bash
docker compose logs backend
```

**Reset everything:**
```bash
docker compose down -v
rm -rf ./data/debtwise.db
docker compose up -d --build
```
