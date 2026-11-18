# MediQueue

A local, multi-hospital appointment and intelligent queue management system built as a college **ADSA (Advanced Data Structures & Algorithms)** project.

MediQueue lets patients book fixed appointment slots, check in on arrival, receive a token and track their live position. Doctors run one independent live queue per day with emergency priority, hospital administrators manage their own hospital, and the platform administrator registers hospitals and their administrators. Live queues are powered by a custom **binary Min-Heap**, **Hash Map** indexes and a **FIFO queue** — no external queue library is used.

Everything runs on one machine. There is no cloud database, no external authentication provider and no SMS/email integration.

---

## Table of contents

1. [Demo accounts](#demo-accounts)
2. [Features by role](#features-by-role)
3. [Tech stack](#tech-stack)
4. [Architecture](#architecture)
5. [DSA design](#dsa-design)
6. [Project structure](#project-structure)
7. [Prerequisites](#prerequisites)
8. [Setup](#setup)
9. [Running the app](#running-the-app)
10. [Demo walkthroughs](#demo-walkthroughs)
11. [Database commands](#database-commands)
12. [API summary](#api-summary)
13. [Realtime (Socket.IO)](#realtime-socketio)
14. [Testing](#testing)
15. [Troubleshooting](#troubleshooting)
16. [Known limitations](#known-limitations)

---

## Demo accounts

All seeded accounts share **one password**, generated randomly on first setup and stored in `server/.env` as `DEMO_PASSWORD`.

Print it with:

```powershell
Select-String -Path server\.env -Pattern '^DEMO_PASSWORD'
```

| Role | Email | Notes |
|---|---|---|
| Platform Administrator | `platform@mediqueue.local` | Registers hospitals and hospital administrators |
| Hospital Administrator | `admin@citycare.local` | City Care Hospital (Pune) |
| Hospital Administrator | `admin@sunrise.local` | Sunrise Multispeciality Hospital (Mumbai) |
| Hospital Administrator | `admin@greenvalley.local` | Green Valley Clinic (Nashik) |
| Doctor | `dr.arjun@citycare.local` | Cardiology, 15 min average, **live queue with emergency patient + delay** |
| Doctor | `dr.sneha@citycare.local` | General Medicine, 12 min average, **live queue** |
| Doctor | `dr.rohan@sunrise.local` | Orthopaedics, 20 min average, **live queue** |
| Doctor | `dr.priya@sunrise.local` | Dermatology, 10 min average |
| Doctor | `dr.imran@greenvalley.local` | Pediatrics, 15 min average, **live queue** |
| Doctor | `dr.kavita@greenvalley.local` | ENT, 12 min average |
| Patient | `patient@example.com` | Aarav Sharma — has a today booking and a tomorrow booking |
| Patients | `patient2@example.com` … `patient12@example.com` | Diya, Vivaan, Ananya, Kabir, Meera, Aditya, Ishita, Riya, Arnav, Sara, Neel |

The seed also creates 42 weekly schedules (every doctor works every weekday), 29 appointments in mixed states, 10 queue entries, 1 active delay report and 12 notifications.

> **Restart the API after reseeding.** Live queues are held in memory and rebuilt from SQLite when the API starts.

---

## Features by role

### Patient
- Register and sign in (patients only can self-register).
- Browse hospitals, doctors, specialisations and available slots.
- Book a fixed appointment slot up to 30 days ahead.
- Check in on the appointment day to receive a token and enter the live queue.
- Track position, patients ahead, estimated wait and estimated start time.
- Cancel a `BOOKED` or waiting `CHECKED_IN` appointment.
- Receive an in-app notification inbox with unread badge.

### Doctor
- See today's appointments and the full day view.
- Run one independent live queue: call next, start consultation, complete, mark no-show.
- Add an emergency patient (priority 0) by searching registered patients.
- Report or clear a delay; the delay is added to every waiting patient's estimate.
- View a DSA panel showing heap size, ordering, FIFO arrival view and operation log.
- Open clinical patient details (age, gender, blood group, reason, phone/email).

### Hospital Administrator
- Edit their own hospital profile (never another hospital's).
- Create, update and deactivate/reactivate doctors.
- Create, update and delete weekly schedules with overlap validation.
- Browse their hospital's appointments by doctor and date.
- Monitor live queues for every doctor with waiting/current/delay counts.
- Receive realtime queue updates over Socket.IO.

### Platform Administrator
- View platform-wide statistics.
- Register a hospital together with its first administrator in one atomic operation.
- Assign an administrator to a hospital that does not have one.
- Update an administrator's name, phone or password.

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 19 + Vite 8 (JavaScript, `.jsx`) |
| Styling | Tailwind CSS 4 + `@tailwindcss/vite` |
| Routing | React Router 7 |
| Icons | `lucide-react` |
| UI primitives | Local shadcn-style components (Button, Card, Input, Select, Badge, Dialog, Table, Tabs, Spinner, EmptyState) |
| Backend | Node.js + Express 5 (ESM) |
| Realtime | Socket.IO 4.8 |
| Database | SQLite (`server/prisma/mediqueue.db`) |
| ORM | Prisma 6.19.3 |
| Auth | JWT (`jsonwebtoken`) + `bcryptjs` |
| Tests | Node built-in test runner (`node:test`) |
| Utilities | `clsx` + `tailwind-merge` |

Prisma is pinned to **6.19.3** on purpose: Prisma 7+ defaults to a TypeScript client and a native driver adapter, while this project is deliberately plain JavaScript. `bcryptjs` is used instead of native `bcrypt` so no Windows build tools are needed.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ Browser (http://localhost:5173)                              │
│ React + Vite + Tailwind + React Router                       │
│ AuthContext · SocketContext · ToastContext                   │
└───────────────┬───────────────────────────┬──────────────────┘
                │ REST /api/*               │ Socket.IO /socket.io
                ▼                           ▼
┌──────────────────────────────────────────────────────────────┐
│ Node + Express API (http://localhost:4000)                   │
│                                                              │
│  routes → controllers → services → Prisma                    │
│                                                              │
│  queue.service.js ── orchestration + transactions            │
│        │                                                     │
│        ▼                                                     │
│  queueRuntime.js (singleton QueueManager + KeyedMutex)       │
│        │                                                     │
│        ▼                                                     │
│  Pure DSA engine (no Express, no Prisma, no Socket.IO)       │
│    QueueManager → PatientQueue → MinHeap + FIFOQueue + Map   │
│    QueueCalculator (positions, wait estimates)               │
└───────────────┬──────────────────────────────────────────────┘
                │ Prisma
                ▼
┌──────────────────────────────────────────────────────────────┐
│ SQLite  server/prisma/mediqueue.db  (WAL mode)               │
│ User · Patient · Doctor · Hospital · DoctorSchedule          │
│ Appointment · QueueEntry · DelayReport · Notification        │
└──────────────────────────────────────────────────────────────┘
```

Key rules:

- **SQLite is the permanent source of truth.** The in-memory heap is a derived, fast serving-order view. It is rebuilt from SQLite on every API start and after any inconsistency is detected.
- **Tokens are issued at check-in**, not at booking, so FIFO reflects actual arrival order. The heap tie-breaker `(priority, tokenNumber)` then reproduces FCFS for normal patients.
- **Emergency priority is `0`, normal is `1`.** Ties are broken by the smaller token number.
- Every authenticated REST request reloads the user identity from SQLite (`GET /api/auth/me` semantics), so deleted accounts or changed roles cannot keep using a stale token.
- Per-doctor/date `KeyedMutex` plus SQLite transactions serialise queue mutations. A unique `slotKey = doctorId|date|slotTime` constraint is the final race guard for bookings (`P2002` → HTTP 409).
- Socket.IO rooms are chosen **by the server** from the freshly loaded identity. The client cannot request a room.

---

## DSA design

### Custom Min-Heap — `server/src/dsa/MinHeap.js`

Binary heap stored in an array.

Comparator: `(a.priority - b.priority) || (a.tokenNumber - b.tokenNumber)`.

| Operation | Complexity | Notes |
|---|---|---|
| `insert` | O(log n) | Append, then bubble up |
| `extractMin` | O(log n) | Move last item to root, sink down |
| `peek` | O(1) | Root is always next patient |
| `heapify` | O(n) | Bottom-up rebuild from SQLite rows |
| `remove` | O(n) + O(log n) | Linear find, then repair |
| `size` / `isEmpty` | O(1) | |

### FIFO Queue — `server/src/dsa/FIFOQueue.js`

Array plus a head index. `dequeue` moves the head pointer instead of calling `Array.shift()`, so it is O(1) amortised; the array is compacted occasionally. `remove` is O(n).

### Patient Queue — `server/src/dsa/PatientQueue.js`

One doctor's waiting list for one day:

- `MinHeap` is the single source of truth for serving order.
- `FIFOQueue` is a derived arrival-order view of **normal** patients (emergencies are excluded because they bypass FCFS).
- `Map<appointmentId, entry>` gives O(1) lookup for cancellations/no-shows.
- `getPosition` scans the heap contents in O(n) to compute 1-based position and patients ahead.

### Queue Manager — `server/src/dsa/QueueManager.js`

`Map<doctorId, PatientQueue>` plus global indexes:

- `entriesByAppointment` — O(1) appointment → entry lookup.
- `doctorDirectory` / `patientDirectory` — O(1) name/room/average lookups.
- `currentByDoctor` — the patient currently being served.
- A bounded operation log (50 entries) that powers the DSA demonstration panel.
- `getDsaSnapshot(doctorId)` returns heap size, ordered waiting list, FIFO view, current patient and recent operations.

### Queue Calculator — `server/src/dsa/QueueCalculator.js`

Pure functions for positions, patients ahead, wait estimates and estimated start times.

```
waitMinutes = round((patientsAhead + (currentPatient ? 1 : 0)) × avgConsultationMinutes + delayMinutes)
```

### Why both a heap and a FIFO queue?

The heap answers “who is next?” in O(log n) while honouring emergency priority. The FIFO queue demonstrates the FCFS arrival view and is used by consistency tests to prove that normal patients are served in check-in order. Both views are exposed in the doctor's DSA panel.

---

## Project structure

```
Default Project/
├── package.json                 # root scripts: setup, dev, test, build
├── README.md
├── PLAN.md                      # phase-by-phase implementation plan
├── .gitignore
├── scripts/
│   └── setup-env.js             # generates server/.env with random secrets
├── client/
│   ├── vite.config.js           # dev server + /api and /socket.io proxy
│   └── src/
│       ├── App.jsx              # all routes
│       ├── components/
│       │   ├── layout/          # AppShell, AuthLayout, PublicLayout, ProtectedRoute, NotificationBell
│       │   ├── ui/              # local shadcn-style primitives
│       │   ├── doctor/          # DSA panel, delay/emergency dialogs, patient details
│       │   ├── patient/         # live queue card, today's appointment card
│       │   ├── hospitalAdmin/   # doctor and schedule dialogs
│       │   └── platform/        # hospital and hospital-admin dialogs
│       ├── context/             # AuthContext, SocketContext, ToastContext
│       ├── hooks/               # usePolling and friends
│       ├── lib/                 # api client, dates, roles, formatting
│       └── pages/
│           ├── public/          # landing, login, register, hospital/doctor directory
│           ├── patient/         # dashboard, appointments, queue, booking
│           ├── doctor/          # dashboard + full-day appointments
│           ├── hospitalAdmin/   # dashboard, doctors, schedules, appointments, queues, profile
│           └── platform/        # dashboard, hospitals, hospital admins
└── server/
    ├── .env.example             # documented environment variables
    ├── prisma/
    │   ├── schema.prisma        # models and enums
    │   ├── migrations/          # SQLite migrations
    │   ├── seed.js              # full idempotent demo dataset
    │   └── mediqueue.db         # local SQLite database (gitignored)
    ├── src/
    │   ├── index.js             # HTTP server + Socket.IO + queue rebuild
    │   ├── app.js               # Express app and error handling
    │   ├── config/              # env, Prisma client
    │   ├── middleware/          # JWT auth, role guards, error handler
    │   ├── routes/              # one router per feature area
    │   ├── controllers/         # request validation and responses
    │   ├── services/            # business logic, transactions, orchestration
    │   ├── dsa/                 # pure MinHeap, FIFOQueue, PatientQueue, QueueManager, QueueCalculator
    │   ├── realtime/            # Socket.IO server, rooms and emitter helpers
    │   └── utils/               # dates, validation, serializers, KeyedMutex
    └── tests/
        ├── dsa/                 # MinHeap, FIFO, PatientQueue, QueueManager, calculator, consistency
        ├── utils/               # ApiError, KeyedMutex
        └── integration/         # auth, hospital, appointment, queue, notifications, platform, socket
```

---

## Prerequisites

- **Node.js 20.19+ or 22.12+** (tested on Node 25.9.0)
- **npm 10+**
- Windows, macOS or Linux. Commands below are shown for PowerShell.
- No database server is required — SQLite is embedded.

---

## Setup

From the project root:

```powershell
npm run setup
```

This runs four steps:

1. `npm --prefix server install`
2. `npm --prefix client install`
3. `npm run setup:env` — creates `server/.env` with a random JWT secret and demo password (skipped if the file already exists)
4. `npm run db:setup` — applies migrations, generates the Prisma client and seeds the demo data

The generated demo password is printed once and saved in `server/.env`.

### Environment variables (`server/.env`)

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `file:./mediqueue.db` | Resolved relative to `prisma/schema.prisma` → `server/prisma/mediqueue.db` |
| `JWT_SECRET` | random 96-char hex | JWT signing secret |
| `JWT_EXPIRES_IN` | `12h` | Token lifetime |
| `PORT` | `4000` | API port |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Allowed client origin |
| `DEMO_PASSWORD` | random | Password for every seeded account |

`server/.env` is gitignored. Never commit it.

---

## Running the app

Use **two terminals** from the project root:

```powershell
# Terminal 1 — API + Socket.IO on port 4000
npm run dev:server
```

```powershell
# Terminal 2 — Vite dev server on port 5173
npm run dev:client
```

Then open **http://localhost:5173**.

Useful URLs:

| URL | Purpose |
|---|---|
| `http://localhost:5173` | React app |
| `http://localhost:4000/api/health` | API health + database check |
| `http://localhost:4000/api` | API base (all routes below) |

The Vite dev server proxies `/api` and `/socket.io` to `http://localhost:4000`, so the browser uses one origin and no CORS configuration is needed.

Production-style frontend build:

```powershell
npm run build
# output: client/dist
```

---

## Demo walkthroughs

### Patient (`patient@example.com`)

1. Sign in and open **Dashboard**. Today's appointment with Dr. Arjun Mehta is visible.
2. Click **Check in**. A token is issued and the patient enters the live queue.
3. Open **My Queue** to see position, patients ahead, estimated wait and estimated start time. The card refreshes every 10 seconds and also receives realtime events.
4. Open **Appointments** to cancel a booking or check in.
5. Use **Book appointment** from any doctor page to pick a future slot.

### Doctor (`dr.arjun@citycare.local`)

1. Open the **Dashboard**. The seeded queue shows token #3 in consultation, token #5 (emergency, priority 0) ahead of token #4 (normal).
2. Click **Call next** → **Start** → **Complete** to move patients through the queue.
3. Use **Add emergency** to search a registered patient and insert them at priority 0.
4. Use **Report delay** (for example 15 minutes) and watch patient estimates and notifications update. **Clear delay** removes it.
5. Inspect the **DSA panel** for heap contents, FIFO arrival view, positions and operation log.
6. Open **Appointments** for the full day, including checked-in and completed patients.

### Hospital Administrator (`admin@citycare.local`)

1. Review the dashboard counters and the live queue monitor.
2. Open **Doctors** to add a doctor, edit details or deactivate/reactivate one.
3. Open **Schedules** to add weekly sessions; overlapping active sessions are rejected.
4. Open **Appointments** to filter by doctor and date.
5. Open **Queues** to watch every doctor's live queue update in realtime.
6. Edit the hospital profile under **Profile**.

### Platform Administrator (`platform@mediqueue.local`)

1. Review platform-wide statistics.
2. Open **Hospitals** and register a new hospital with its first administrator in one step.
3. Open **Hospital Admins** to assign an administrator to a hospital without one, or update their name, phone or password.

### Suggested demo flow for a viva

1. Sign in as the patient, book a slot and check in.
2. Sign in as the doctor in a second browser profile, call the patient, report a delay.
3. Show the patient's live position and notification update.
4. Sign in as the hospital administrator and show the live queue monitor.
5. Sign in as the platform administrator and register a new hospital.
6. Open the doctor's DSA panel and explain the Min-Heap ordering and FIFO tie-breaker.

> Browsers share `localStorage` per origin. To run two roles side by side, use two browser profiles or two origins (for example `http://localhost:5173` and `http://127.0.0.1:5174`).

---

## Database commands

Run these from the project root (they delegate to `server/`):

| Command | What it does |
|---|---|
| `npm run db:setup` | Apply migrations + generate client + seed |
| `npm run db:seed` | Recreate the full demo dataset (idempotent) |
| `npm run db:migrate` | Create a new migration during development |
| `npm run db:deploy` | Apply existing migrations |
| `npm run db:generate` | Regenerate the Prisma client |
| `npm run db:reset` | Drop and recreate the database, then reseed |
| `npm run db:studio` | Open Prisma Studio |

Equivalent direct commands inside `server/`:

```powershell
cd server
npm run db:seed
npm run db:reset
npm run db:studio
```

Database file: `server/prisma/mediqueue.db`. SQLite runs in WAL mode, so `-wal` and `-shm` files may also appear. All three are gitignored.

**Stop the API before running `db:deploy`, `db:reset` or the full `db:setup`.** Prisma's migration engine needs an exclusive lock on the SQLite file. `db:seed` can run while the API is up, but restart the API afterwards so the in-memory queues rebuild from the new data.

---

## API summary

Base URL: `http://localhost:4000/api`. Protected routes require `Authorization: Bearer <token>`.

### Public

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Service + database health |
| `POST` | `/auth/register` | Patient self-registration (role is forced to `PATIENT`) |
| `POST` | `/auth/login` | Email + password → JWT |
| `GET` | `/hospitals` | List active hospitals (public fields only) |
| `GET` | `/hospitals/:id` | Hospital details with active doctors |
| `GET` | `/doctors` | List active doctors (filters: hospital, specialisation, search) |
| `GET` | `/doctors/specializations` | Distinct specialisations |
| `GET` | `/doctors/:id` | Doctor details |
| `GET` | `/doctors/:id/slots?date=YYYY-MM-DD` | Fixed slots with availability |

### Authenticated

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/auth/me` | any | Current user from SQLite |
| `GET` | `/notifications` | any | Own notifications + unread count |
| `PATCH` | `/notifications/:id/read` | any | Mark one notification read |
| `POST` | `/notifications/read-all` | any | Mark all read |

### Patient

| Method | Path | Description |
|---|---|---|
| `POST` | `/appointments` | Book a slot (`doctorId`, `date`, `slotTime`, `reason`) |
| `GET` | `/appointments/mine` | Own appointments |
| `POST` | `/appointments/:id/check-in` | Check in, issue token, join queue |
| `PATCH` | `/appointments/:id/cancel` | Cancel a `BOOKED` or waiting `CHECKED_IN` appointment |
| `GET` | `/queues/me` | Live queue view for own active appointment |

### Doctor

| Method | Path | Description |
|---|---|---|
| `GET` | `/doctor/queue` | Today's queue (current, waiting, counts, delay, DSA snapshot) |
| `POST` | `/doctor/queue/call-next` | Call the next patient from the heap |
| `POST` | `/doctor/queue/start` | Start the called consultation |
| `POST` | `/doctor/queue/complete` | Complete the current consultation |
| `POST` | `/doctor/queue/emergency` | Add an emergency patient (priority 0) |
| `POST` | `/doctor/queue/:entryId/no-show` | Mark a waiting patient no-show |
| `POST` | `/doctor/delay` | Report/update a delay (`delayMinutes`, `reason`) |
| `POST` | `/doctor/delay/clear` | Resolve the active delay |
| `GET` | `/doctor/appointments?date=YYYY-MM-DD` | Full day view |
| `GET` | `/doctor/patients?query=` | Search registered patients (≥2 chars, ≤8 results) |

### Hospital Administrator

| Method | Path | Description |
|---|---|---|
| `GET` | `/hospital/me` | Own hospital profile |
| `PATCH` | `/hospital/me` | Update own hospital profile |
| `GET` | `/hospital/doctors` | Own hospital's doctors |
| `POST` | `/hospital/doctors` | Create a doctor account + profile |
| `PATCH` | `/hospital/doctors/:id` | Update a doctor |
| `POST` | `/hospital/doctors/:id/deactivate` | Deactivate/reactivate a doctor |
| `GET` | `/hospital/doctors/:id/schedules` | Weekly schedules |
| `POST` | `/hospital/doctors/:id/schedules` | Create a schedule |
| `PATCH` | `/hospital/doctors/:id/schedules/:scheduleId` | Update a schedule |
| `DELETE` | `/hospital/doctors/:id/schedules/:scheduleId` | Delete a schedule |
| `GET` | `/hospital/dashboard` | Own hospital counters |
| `GET` | `/hospital/appointments` | Own hospital appointments (doctor/date filters) |
| `GET` | `/hospital/queues` | Live queues + totals for own hospital |

### Platform Administrator

| Method | Path | Description |
|---|---|---|
| `GET` | `/platform/dashboard` | Platform-wide counters |
| `GET` | `/platform/hospitals` | All hospitals |
| `POST` | `/platform/hospitals` | Create hospital + first administrator atomically |
| `GET` | `/platform/hospital-admins` | All hospital administrators |
| `POST` | `/platform/hospital-admins` | Assign an admin to a hospital without one |
| `PATCH` | `/platform/hospital-admins/:id` | Update name, phone or password |

Common error shape:

```json
{ "error": { "message": "Human readable message", "details": "optional" } }
```

`401` = missing/invalid session, `403` = wrong role or wrong hospital scope, `404` = not found, `409` = slot/state conflict, `400` = validation error.

---

## Realtime (Socket.IO)

The browser connects to the same origin (`/socket.io`), which Vite proxies to port 4000. The JWT is sent in the handshake:

```js
io({ path: '/socket.io', auth: { token } });
```

The server verifies the JWT, reloads the identity from SQLite and joins **only** server-chosen rooms.

| Room | Members |
|---|---|
| `user:{userId}` | Every authenticated user (notifications) |
| `patient:{userId}` | That patient |
| `doctor:{doctorId}` | That doctor |
| `hospital:{hospitalId}` | That hospital's administrator |
| `platform:admins` | Platform administrators |

| Event | Typical room(s) | Meaning |
|---|---|---|
| `realtime:ready` | connecting socket | Handshake accepted; lists joined rooms |
| `queue:updated` | doctor, hospital | Queue snapshot changed |
| `queue:position` | patient | Position/estimate changed |
| `patient:called` | patient, doctor, hospital | Token called |
| `queue:emergency` | doctor, hospital | Emergency patient inserted |
| `doctor:delay` | patient, doctor, hospital | Delay reported/cleared |
| `appointments:updated` | patient, doctor, hospital | Appointment status changed |
| `notification:new` | user | New inbox notification |

Polling remains as a fallback, so the UI still works if the websocket is blocked. Polling pauses while the tab is hidden.

---

## Testing

```powershell
# Unit tests: custom DSA structures, utilities (no database required)
npm test

# Integration tests: REST + Socket.IO against isolated temporary SQLite databases
npm run test:api

# Frontend production build
npm run build
```

- `npm test` covers `MinHeap`, `FIFOQueue`, `PatientQueue`, `QueueManager`, `QueueCalculator`, heap/FIFO consistency, `ApiError` and `KeyedMutex`.
- `npm run test:api` starts the Express app against per-suite databases (`test-auth.db`, `test-hospital.db`, `test-appointment.db`, `test-queue.db`, `test-notifications.db`, `test-platform.db`, `test-socket.db`). Each suite creates and deletes its own database, so the demo database is never touched.
- Current status: **44 unit tests** and **88 integration tests** passing.

---

## Troubleshooting

### Port 4000 already in use (`EADDRINUSE`)

```powershell
Get-NetTCPConnection -LocalPort 4000 -State Listen | Select-Object OwningProcess
Stop-Process -Id <pid>
```

Then start `npm run dev:server` again. Change `PORT` in `server/.env` only if you also update the Vite proxy target.

### `database is locked` during `npm run db:setup`

Stop the API first (`Ctrl+C` in the `npm run dev:server` terminal), run the database command, then start the API again. Prisma migrations need exclusive access to the SQLite file.

### I reseeded but the doctor queue looks stale

Live queues are in memory. Restart the API (`Ctrl+C`, then `npm run dev:server`). It prints how many queues and active entries were rebuilt from SQLite.

### Everyone is logged out after reseeding

The seed deletes and recreates users, so old JWTs point at IDs that no longer exist. Sign in again. The login page demo buttons fill the email only; enter the shared demo password from `server/.env`.

### Vite shows 404/502 for `/api`

Make sure the API is running on port 4000 before using the app. The proxy target is fixed in `client/vite.config.js`.

### Websocket does not connect but pages still work

The app falls back to polling, so pages keep working. Check that `/socket.io` is proxied (`ws: true`) and that no corporate proxy or firewall blocks websockets.

### Prisma engine error on Windows

Run `npm run db:generate` inside `server/`. If the engine download failed, delete `server/node_modules/.prisma` and rerun. Node 20.19+/22.12+ is recommended.

### `npm audit` reports high-severity advisories

They come from the Prisma CLI's `deepmerge-ts` development dependency. The fix requires a breaking Prisma 7 upgrade, which would introduce a TypeScript/native-adapter workflow. It is intentionally deferred; the advisories are not in the runtime server or client bundles.

### Database reset

```powershell
npm run db:reset
```

This drops the database, reapplies migrations and reseeds. Restart the API afterwards.

---

## Known limitations

- Single-machine, single-instance deployment. Live queues live in process memory; horizontal scaling would need a shared queue store.
- No email/SMS delivery — notifications are an in-app inbox only.
- No payment, prescriptions, medical records or file uploads.
- Fixed-length appointment slots; no recurring appointments or rescheduling flow (cancel and rebook instead).
- One administrator per hospital (`Hospital.adminId` is unique).
- Emergency patients must already have a patient account; there is no walk-in account creation.
- Delay is one active report per doctor per day (updated rather than stacked).
- JWT logout is client-side only; tokens remain valid until expiry (12 h).
- Times and dates are stored as local strings (`YYYY-MM-DD`, `HH:mm`) to avoid timezone bugs. The app is intended for one local timezone.
- UI copy is English only.

---

## Academic note

This project was built phase by phase with approval gates. See `PLAN.md` for the original scope, design decisions and phase checklist. The DSA implementations in `server/src/dsa/` are written from scratch and are covered by dedicated unit tests.
