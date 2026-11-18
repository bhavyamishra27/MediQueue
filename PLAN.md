# MediQueue — Implementation Plan

**Phase 0: Repository inspection and planning**
**Status:** Project complete - Phase 10 approved and closed
**Project type:** College ADSA micro project (local, single-machine)

---

## 1. Inspection summary

| Item | Finding |
|---|---|
| Working directory | `C:\Users\bhavy\OneDrive\Documents\Default Project` |
| Existing files | **None** — the folder is empty |
| Git repository | **No** (`.git` does not exist) |
| Existing dependencies | **None** (no `package.json`) |
| Existing functionality | **None** — this is a greenfield build, so nothing can be accidentally removed |
| OS | Windows (`win32`) |
| Node.js | `v25.9.0` |
| npm | `11.12.1` |
| Git | `2.55.0` |
| Internet | Available for initial package installation; the app itself will run fully offline |

Because there is no existing code, there is no migration or preservation work. The plan below defines the project from scratch.

---

## 2. Product scope

MediQueue is a local, multi-hospital appointment and live-queue prototype with four roles:

- **Patient** — discover hospitals/doctors, book a fixed slot, check in on the appointment day, receive a token, track live position and estimated time, cancel, view notifications.
- **Doctor** — see today's appointments, run one independent live queue, call/start/complete consultations, mark no-shows, add emergency patients, report delays, view a DSA demonstration panel.
- **Hospital Administrator** — manage only their own hospital's profile, doctors, schedules, appointments and queue monitoring.
- **Platform Administrator** — register hospitals and create/manage hospital administrator accounts.

The queue engine is the ADSA centrepiece: custom Hash Maps (`Map`), binary Min-Heap, FIFO Queue and array-based calculations, with SQLite as the permanent source of truth.

---

## 3. Technology decisions

### 3.1 Chosen versions

| Layer | Choice | Version strategy |
|---|---|---|
| Frontend | React + Vite (JavaScript, `.jsx`) | React 19, Vite 8 |
| Styling | Tailwind CSS | Tailwind 4 + `@tailwindcss/vite` |
| Routing | React Router | v7, declarative API |
| Icons | lucide-react | current |
| UI primitives | Local shadcn-style components | Button, Card, Input, Select, Badge, Dialog, Table, Tabs, Spinner, EmptyState |
| Backend | Node.js + Express 5 | ESM JavaScript |
| Real-time | Socket.IO 4.8 | Server + client |
| Database | SQLite | `server/prisma/mediqueue.db` |
| ORM | Prisma | **6.19.3** (see rationale) |
| Auth | JWT + bcrypt | `jsonwebtoken`, `bcryptjs` |
| Tests | Node built-in test runner | `node:test` + `node:assert` |
| Utility | `clsx` + `tailwind-merge` | tiny class-name helper only |

No TypeScript, no Redux, no React Query, no Zod, no external UI kit, no cloud services, no SMS/email providers.

### 3.2 Deliberate decisions and reasons

1. **Prisma 6.19.3 instead of Prisma 7/8**
   - Prisma 7+ generates a TypeScript-only client by default and requires a driver adapter (`better-sqlite3`, a native module).
   - The project must be plain JavaScript. Prisma 6's `prisma-client-js` generator produces JavaScript in `node_modules`, needs no native npm build, and works with SQLite out of the box.
   - Prisma 6.19.3 supports Node `>=18.18`, so Node 25 should work. This will be verified in Phase 1. If it does not, the fallback is Node 22 LTS (recommended) rather than adding TypeScript tooling.

2. **`bcryptjs` instead of native `bcrypt`**
   - It implements the bcrypt algorithm in pure JavaScript, so no Visual Studio Build Tools are required on Windows.
   - Passwords are still hashed with bcrypt; plaintext is never stored.

3. **Local shadcn-style primitives instead of the shadcn CLI**
   - shadcn/ui is a source-copy pattern, not a runtime library. Its generated components and CLI assume TypeScript/Radix setup.
   - We will implement the same visual language with Tailwind and a small `cn()` helper. This keeps the dependency list minimal, avoids network-dependent generators, and keeps every component readable for a college project.
   - If you specifically want the official shadcn CLI/Radix components, say so before Phase 1.

4. **Tokens are issued at check-in, not booking**
   - This makes FIFO ordering genuinely first-come-first-served by arrival.
   - The Min-Heap tie-breaker `(priority, tokenNumber)` then reproduces FIFO for normal patients exactly.
   - Booking confirms a slot; the digital token appears after check-in. This matches the requirement "Check in for appointments. Receive a digital token."

5. **One hospital administrator per hospital**
   - Enforced by `Hospital.adminId @unique`. It keeps the platform-admin flow simple. Multiple admins per hospital can be added later with a join table if required.

6. **Emergency patients must already be registered**
   - The doctor searches registered patients by name/email and adds the selected patient as an emergency.
   - Creating unregistered walk-in accounts with generated passwords is deliberately out of scope for v1 to avoid account/security complexity. This can be added if you want it.

---

## 4. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ React SPA (Vite, localhost:5173)                             │
│  Public pages · Patient · Doctor · Hospital Admin · Platform │
│  AuthContext · API client · Socket.IO client · UI primitives │
└──────────────────────────┬───────────────────────────────────┘
                           │ Vite proxy: /api + /socket.io (ws)
┌──────────────────────────▼───────────────────────────────────┐
│ Express API + Socket.IO (localhost:4000)                     │
│                                                              │
│  routes/ → controllers/ → services/ → Prisma → SQLite        │
│                              │                               │
│                              ▼                               │
│                    QueueService (DB transactions,            │
│                    authorization, locks, events)             │
│                              │                               │
│                              ▼                               │
│              dsa/ QueueManager (in-memory, DB-free)          │
│   Hash Maps · PatientQueue (MinHeap + FIFO mirror)           │
│   MinHeap · FIFOQueue · QueueCalculator · arrays             │
└──────────────────────────────────────────────────────────────┘
                           │
                 server/prisma/mediqueue.db
```

### Separation of responsibilities

- **routes** — URL + HTTP method wiring, middleware.
- **controllers** — thin request parsing and response shaping.
- **services** — business rules, authorization checks, Prisma transactions, real-time emission.
- **dsa/** — pure JavaScript data structures and calculations. No Express, no Prisma, no Socket.IO.
- **QueueService** — the only bridge between database records and the live DSA engine. All queue mutations pass through it.
- **realtime** — holds the Socket.IO server instance and room-emit helpers; services call it.

### Folder structure (planned)

```
Default Project/
├─ PLAN.md
├─ README.md
├─ .gitignore
├─ package.json                     # root convenience scripts (no deps)
├─ scripts/setup-env.js             # creates server/.env with a random JWT secret
├─ server/
│  ├─ package.json
│  ├─ .env.example
│  ├─ .env                          # generated, gitignored
│  ├─ prisma/
│  │  ├─ schema.prisma
│  │  ├─ migrations/
│  │  ├─ seed.js
│  │  └─ mediqueue.db               # generated, gitignored
│  ├─ src/
│  │  ├─ index.js                   # HTTP + Socket.IO bootstrap, queue rebuild
│  │  ├─ app.js                     # Express app (testable without listen)
│  │  ├─ config/                    # env, prisma client
│  │  ├─ realtime/                  # Socket.IO server, rooms, emitters
│  │  ├─ middleware/                # auth, roles, errors, validation
│  │  ├─ routes/                    # auth, public, patient, doctor, hospital, platform
│  │  ├─ controllers/
│  │  ├─ services/                  # auth, hospital, doctor, appointment, queue, notification
│  │  ├─ dsa/
│  │  │  ├─ MinHeap.js
│  │  │  ├─ FIFOQueue.js
│  │  │  ├─ PatientQueue.js
│  │  │  ├─ QueueManager.js
│  │  │  ├─ QueueCalculator.js
│  │  │  └─ index.js
│  │  └─ utils/                     # ApiError, date/time, KeyedMutex, serializers
│  └─ tests/
│     ├─ dsa/*.test.js
│     └─ integration/*.test.js
└─ client/
   ├─ package.json
   ├─ vite.config.js                # /api + /socket.io proxy
   ├─ index.html
   └─ src/
      ├─ main.jsx, App.jsx, index.css
      ├─ lib/                       # api, dates, status maps, cn
      ├─ context/                   # AuthContext, SocketContext, ToastContext
      ├─ components/ui/             # local shadcn-style primitives
      ├─ components/layout/         # AppShell, Sidebar, Topbar, ProtectedRoute
      ├─ components/queue/          # QueueList, QueueStats, Estimate, DsaPanel
      └─ pages/
         ├─ public/
         ├─ patient/
         ├─ doctor/
         ├─ hospitalAdmin/
         └─ platformAdmin/
```

---

## 5. Database model (SQLite + Prisma)

### Models

| Model | Key fields | Important constraints |
|---|---|---|
| `User` | id, email, passwordHash, name, phone, role, createdAt | `email @unique`; role enum |
| `Patient` | id, userId, dateOfBirth, gender, bloodGroup | `userId @unique` |
| `Hospital` | id, name, address, city, phone, email, description, adminId | `adminId @unique` (one admin per hospital) |
| `Doctor` | id, userId, hospitalId, specialization, qualification, experienceYears, avgConsultationMinutes, roomNumber, bio, isActive | `userId @unique`; index on hospitalId |
| `DoctorSchedule` | id, doctorId, dayOfWeek (0–6), startTime ("09:00"), endTime ("13:00"), slotDurationMinutes, isActive | `@@unique([doctorId, dayOfWeek, startTime])` |
| `Appointment` | id, patientId, doctorId, date ("YYYY-MM-DD"), slotTime ("10:15"), slotKey, status, isEmergency, reason, bookedAt, checkedInAt, calledAt, startedAt, completedAt, cancelledAt, noShowAt | `slotKey @unique`; indexes on `(doctorId,date)`, `(patientId,date)`, `(date,status)` |
| `QueueEntry` | id, doctorId, patientId, appointmentId, queueDate, tokenNumber, priority (0/1), status, checkedInAt, calledAt, startedAt, completedAt, noShowAt, cancelledAt | `appointmentId @unique`; `@@unique([doctorId, queueDate, tokenNumber])`; queue index |
| `DelayReport` | id, doctorId, date, delayMinutes, reason, isActive, createdAt, resolvedAt | one active report per doctor/day in service logic |
| `Notification` | id, userId, title, message, type, isRead, appointmentId, createdAt | index on `(userId, isRead)` |

### Enums

- `Role`: `PATIENT`, `DOCTOR`, `HOSPITAL_ADMIN`, `PLATFORM_ADMIN`
- `AppointmentStatus`: `BOOKED`, `CHECKED_IN`, `CALLED`, `IN_CONSULTATION`, `COMPLETED`, `CANCELLED`, `NO_SHOW`
- `QueueStatus`: `WAITING`, `CALLED`, `IN_CONSULTATION`, `COMPLETED`, `NO_SHOW`, `CANCELLED`
- `NotificationType`: `APPOINTMENT`, `QUEUE`, `DELAY`, `EMERGENCY`, `SYSTEM`

### Design notes

- **Dates and times are stored as strings** (`YYYY-MM-DD`, `HH:mm`) to avoid timezone bugs. The app is local, so server and browser share the same clock. Helper functions use local date parts, never `new Date("YYYY-MM-DD")` (which parses as UTC).
- **Slot uniqueness:** `slotKey = doctorId|date|slotTime` is set for scheduled bookings. Cancelling sets `slotKey = null`, freeing the slot; completed/no-show appointments keep it. SQLite allows multiple `NULL`s in a unique column.
- **Tokens are per doctor per day**, generated inside a transaction at check-in using `MAX(tokenNumber) + 1`. Tokens are never reused, even after cancellation, so the tie-breaker remains monotonic.
- **Emergency appointments** have `slotTime = null`, `slotKey = null`, `isEmergency = true`, and a normal numeric token with priority `0`.
- **One queue per doctor per day.** Active statuses are `WAITING`, `CALLED`, `IN_CONSULTATION`; terminal statuses are `COMPLETED`, `NO_SHOW`, `CANCELLED`.

---

## 6. DSA queue engine design

### 6.1 MinHeap (`dsa/MinHeap.js`)

Custom binary min-heap backed by an array.

- Comparator: `(a, b) => (a.priority - b.priority) || (a.tokenNumber - b.tokenNumber)`
- Priority: Emergency `0`, Normal `1`. Lower value is served first. Equal priority → smaller token first.
- Methods: `insert()` bubble-up, `extractMin()` swap-with-last + sink-down, `peek()`, `heapify(array)` bottom-up, `size()`, `isEmpty()`, `toArray()`, `clear()`, `remove(predicate)` (needed for cancellations/no-shows).
- Complexities: insert/extract `O(log n)`, peek/size/isEmpty `O(1)`, heapify `O(n)`, remove `O(n)` search + `O(log n)` repair.
- No external libraries.

### 6.2 FIFOQueue (`dsa/FIFOQueue.js`)

Custom queue with an array + head index (avoids `Array.shift()` cost).

- Methods: `enqueue()`, `dequeue()`, `peek()`, `size()`, `isEmpty()`, `toArray()`, `remove(predicate)`, `clear()`.
- Complexities: enqueue/dequeue/peek `O(1)` amortized, removal `O(n)`.

### 6.3 PatientQueue (`dsa/PatientQueue.js`)

One instance per doctor. Holds:

- A `MinHeap` of all waiting entries — **the single source of truth for serving order**.
- A `FIFOQueue` of **normal** entries in check-in order — used to demonstrate FCFS and to verify the invariant that, with no emergencies, heap extraction order equals FIFO order.
- A `Map` from `appointmentId` → entry for `O(1)` lookup.

Key methods: `insert()`, `remove()`, `peekNext()`, `extractNext()`, `getPosition()`, `getOrderedEntries()`, `getHeapArray()`, `getFifoOrder()`, `rebuild()`, `size()`, `isEmpty()`.

**How FIFO is preserved without a second scheduler:** tokens are issued in check-in order, so for equal priority the heap's `tokenNumber` tie-breaker serves patients in exactly the same order as the FIFO queue. The FIFO queue is a derived arrival-order view for the DSA panel and tests; it never independently decides who is called. Emergencies are excluded from the FIFO view because they intentionally bypass FCFS. This is documented in code comments and the README.

### 6.4 QueueManager (`dsa/QueueManager.js`)

Pure in-memory state, no DB/Express imports:

- `doctorQueues: Map<doctorId, PatientQueue>` — doctor-specific queues.
- `entriesByAppointment: Map<appointmentId, entry>` — cross-queue `O(1)` lookup.
- `doctorDirectory: Map<doctorId, {name, hospitalId, avgConsultationMinutes}>` — fast metadata lookup.
- `patientDirectory: Map<patientId, {name}>` — only the display name needed by the queue, not medical data.
- `currentByDoctor: Map<doctorId, entry>` — the patient currently called/in consultation.
- `operations` — bounded in-memory log of recent queue operations with names, complexity labels and timestamps.
- Methods: `rebuildDoctorQueue()`, `insertWaiting()`, `removeWaiting()`, `callNext()`, `setCurrent()`, `clearCurrent()`, `getSnapshot()`, `getDsaSnapshot()`, `clearDoctor()`.
- Synchronous and deterministic, so it is easy to unit test.

### 6.5 QueueCalculator (`dsa/QueueCalculator.js`)

Pure functions:

- `getPosition(entries, target)` — `1 +` count of entries that sort before the target by `(priority, tokenNumber)`. Scans the array, `O(n)`.
- `getAheadCount(entries, target)` — position minus one.
- `estimateWaitMinutes({position, currentPatient, avgConsultationMinutes, delayMinutes})` — `(ahead + (currentPatient ? 1 : 0)) × avg + delay`.
- `estimateStartTime({now, slotTime, ...})` — starts from `max(now, appointment slot time)` plus the wait estimate.
- `calculateEffectiveAverage(doctorAvg, completedTodayDurations)` — uses the doctor's configured average; once at least 3 consultations are completed today, uses today's actual average. This is the "completed consultations" input to the model.
- All estimates are labelled approximate in the UI; they are not guaranteed consultation times.

### 6.6 QueueService (DB-aware orchestration)

Not part of `dsa/`, but the only place where DB and engine meet:

- **Startup rebuild:** load all doctors, today's active `QueueEntry` rows, current patients, active delays and completed-consultation durations; rebuild every doctor's queue via `QueueManager.rebuildDoctorQueue()`. This is how active queues survive restarts.
- **Check-in:** validate appointment ownership/status/date, lock the doctor-day, transactionally generate the next token, create `QueueEntry(WAITING)`, update `Appointment(CHECKED_IN)`, then insert into the live heap/FIFO, notify, emit.
- **Call next:** reject if a patient is already called/in consultation; peek the heap, transactionally mark `CALLED`, extract from heap, set current, notify/emit.
- **Start / complete consultation:** transition current entry and appointment, clear current on completion, emit.
- **No-show:** remove from waiting heap or clear current, update statuses, emit.
- **Cancel:** patient-owned `BOOKED` or waiting `CHECKED_IN` only; remove from queue if waiting, free `slotKey`, update statuses, emit. Called/in-consultation cancellations are rejected.
- **Emergency:** create a same-day emergency appointment + waiting entry with priority `0` and the next token, insert into heap, emit; notify waiting patients that estimates may change.
- **Delay:** resolve the previous active report, create a new active report with total current delay, update doctor metadata, notify waiting patients, emit.
- **Patient queue state:** own position, token, status, estimate, plus a privacy-safe queue view (tokens and masked names only).
- **Doctor/hospital snapshots:** full names for authorized staff.

### 6.7 Concurrency and consistency

- A small `KeyedMutex` utility serializes operations per `doctorId` (queue actions) and per `doctorId|date` (booking/check-in token generation).
- Each mutation uses `prisma.$transaction(async (tx) => ...)` so related appointment/queue/notification writes commit atomically.
- SQLite runs in WAL mode with `busy_timeout` set at startup; SQLite still has a single writer, so locks are intentionally small.
- In-memory state is updated **after** the transaction commits. If anything fails, the heap is untouched and the database remains authoritative.
- On startup, queues are rebuilt from SQLite, so a crash cannot leave a permanently inconsistent in-memory queue.
- Unique constraints (`slotKey`, `(doctorId, queueDate, tokenNumber)`, `appointmentId`) are the final race guards; Prisma `P2002` is mapped to HTTP 409.

### 6.8 Status transitions

```
Appointment: BOOKED ──check-in──> CHECKED_IN ──call──> CALLED
             │                        │                 │
             │                        │                 ├──start──> IN_CONSULTATION ──complete──> COMPLETED
             │                        │                 └──no-show──> NO_SHOW
             └──cancel──> CANCELLED   └──cancel/no-show──> CANCELLED / NO_SHOW
QueueEntry:  WAITING ──call──> CALLED ──start──> IN_CONSULTATION ──complete──> COMPLETED
                │                 │
                └──cancel/no-show─┴──no-show──> CANCELLED / NO_SHOW
```

---

## 7. API surface (REST, `/api`)

### Auth
- `POST /auth/register` — patient self-registration only
- `POST /auth/login`
- `GET /auth/me`

### Public discovery
- `GET /hospitals` — list/search
- `GET /hospitals/:id` — profile + active doctors
- `GET /doctors?search=&specialization=&hospitalId=`
- `GET /doctors/:id` — public profile + schedules
- `GET /doctors/:id/slots?date=YYYY-MM-DD` — generated slots + availability

### Patient
- `POST /appointments` — book a slot
- `GET /appointments/mine`
- `POST /appointments/:id/check-in` — creates token + queue entry
- `PATCH /appointments/:id/cancel`
- `GET /queues/me` — own active queue state + safe queue view
- `GET /notifications`
- `PATCH /notifications/:id/read`
- `POST /notifications/read-all`

### Doctor
- `GET /doctor/appointments?date=` — the doctor's own day list with patient info and counts
- `GET /doctor/queue` — live snapshot + DSA snapshot
- `POST /doctor/queue/call-next`
- `POST /doctor/queue/start`
- `POST /doctor/queue/complete`
- `POST /doctor/queue/:entryId/no-show`
- `POST /doctor/queue/emergency` — `{ patientId, reason }`
- `POST /doctor/delay` — `{ delayMinutes, reason }`
- `POST /doctor/delay/clear`
- `GET /doctor/patients?query=` — registered-patient search for the emergency-add flow

### Hospital administrator (scoped to own hospital)
- `GET /hospital/me`, `PATCH /hospital/me`
- `GET /hospital/doctors`, `POST /hospital/doctors`
- `PATCH /hospital/doctors/:id`, `POST /hospital/doctors/:id/deactivate`
- `GET/POST/PATCH/DELETE /hospital/doctors/:id/schedules`
- `GET /hospital/appointments?date=&doctorId=&status=`
- `GET /hospital/queues` — read-only monitoring of every doctor's queue

### Platform administrator
- `GET /platform/dashboard`
- `GET /platform/hospitals`, `POST /platform/hospitals`
- `GET /platform/hospital-admins`, `POST /platform/hospital-admins`
- `PATCH /platform/hospital-admins/:id` — name/phone/password reset

### Health
- `GET /health` — server + database check

### Socket.IO events

Server joins authenticated users to fixed rooms only (no client-chosen rooms):

- `patient:{userId}`
- `doctor:{doctorId}`
- `hospital:{hospitalId}`
- `platform:admins`

Events:

| Event | Recipients | Payload |
|---|---|---|
| `queue:updated` | doctor, hospital | full queue snapshot + DSA snapshot |
| `queue:position` | each waiting patient | own token, position, estimate, current token |
| `patient:called` | patient + doctor | token, room, doctor name |
| `queue:emergency` | doctor, hospital | emergency entry + updated queue |
| `doctor:delay` | waiting patients | delay minutes, reason, updated estimate |
| `appointments:updated` | doctor, hospital, patient | refresh signal |
| `notification:new` | user | notification |

Socket handshake requires `auth.token`; the server verifies the JWT and role, then joins rooms itself. Expired/invalid tokens are rejected.

---

## 8. Frontend plan

### Routes

**Public**
- `/` landing
- `/login`, `/register`
- `/hospitals`, `/hospitals/:id`
- `/doctors`, `/doctors/:id`

**Patient** (`/patient/*`, protected)
- dashboard (next appointment + active queue summary)
- `/appointments` — upcoming/past, cancel, check-in
- `/book/:doctorId` — date + slot selection
- `/queue` — live token, position, estimate, queue list
- `/notifications`

**Doctor** (`/doctor/*`, protected)
- dashboard — stats, current patient, call/start/complete
- `/appointments` — today's list with patient info
- `/queue` — live queue, emergency add, no-show, delay modal, DSA panel
- `/delay` — report/clear delay + history

**Hospital admin** (`/hospital/*`, protected)
- dashboard
- `/doctors` — add/edit/deactivate
- `/schedules` — per-doctor weekly schedules
- `/appointments` — filterable read-only list
- `/queues` — monitor all doctor queues

**Platform admin** (`/platform/*`, protected)
- dashboard
- `/hospitals` — list + register
- `/hospital-admins` — list + create/manage

### Shared UI

- `AppShell` with role-based sidebar, topbar, mobile drawer, notification badge.
- `ProtectedRoute` checks authentication + allowed roles; redirects to login or a 403 page.
- `AuthContext` stores JWT in `localStorage`, hydrates `/auth/me`, exposes login/logout/register.
- `ToastContext` for success/error feedback.
- API client attaches `Authorization: Bearer <token>` and handles `401` by logging out.
- Socket hook connects after login, reconnects, subscribes to events, and falls back to 15-second polling if disconnected.
- Reusable status badges, stat cards, queue rows, empty states, loading spinners, confirmation dialogs.

### Design direction

- White and `slate-50` backgrounds; blue (`blue-600`) primary; teal (`teal-600`) secondary accent.
- Rounded-2xl white cards, 1px slate borders, subtle shadows, consistent 4/6/8 spacing.
- System font stack (no external font downloads), lucide icons, initials-based avatars (no external images).
- No heavy gradients or animations; responsive tables collapse to cards on small screens.
- Emergency = red badge; normal = blue/slate; completed = green; delay = amber.

### DSA demonstration panel (doctor queue page)

Tabs/sections:
1. **Live queue** — ordered waiting list with token, priority, position, estimated time.
2. **Heap array** — raw heap array boxes with indices; root highlighted; parent/child indices shown.
3. **FIFO vs priority** — normal arrival order vs actual heap extraction order; explains why an emergency jumps ahead.
4. **Operations** — recent operation log (`insert`, `extractMin`, `peek`, `heapify`, `remove`) with time complexity.
5. **Actions** — "Add emergency", "Call next", "Complete" trigger the real queue so the heap visibly changes. A complexity reference table is always visible.

---

## 9. Seed data and demo experience

### Accounts

| Role | Count | Demo email pattern | Password |
|---|---|---|---|
| Platform admin | 1 | `platform@mediqueue.local` | from `DEMO_PASSWORD` in `server/.env` |
| Hospital admins | 3 | `admin@citycare.local`, `admin@sunrise.local`, `admin@greenvalley.local` | same demo password |
| Doctors | 6 | e.g. `dr.arjun@citycare.local` | same demo password |
| Patients | 12 | `patient@example.com`, `patient2@example.com`, … | same demo password |

The README will list exact emails and the demo password. The password is stored in `server/.env` (gitignored), not hardcoded in source. The setup script creates `.env` with a documented demo value; JWT secret is random.

### Data

- 3 hospitals: City Care Hospital, Sunrise Multispeciality, Green Valley Medical Center.
- 6 doctors across 6 specializations: Cardiology, General Medicine, Orthopedics, Pediatrics, Dermatology, ENT.
- Weekly schedules for every day (so the demo works on any weekday), with some evening sessions.
- 12 patients with basic profiles.
- Today's appointments in mixed states: completed, in consultation, waiting, booked; one active emergency; one doctor with a reported delay.
- Future appointments and past completed/cancelled appointments.
- Queue entries consistent with today's appointments; tokens 1..N per doctor.
- Notifications for patients and doctors.
- Dates are generated relative to the day the seed runs, so the demo is always "today".
- Seed is idempotent (clears app tables in dependency order, then recreates). `npm run db:seed` resets demo data; `npm run db:reset` reapplies migrations + seed.

### Suggested demo flow (README)

1. Log in as a patient → book a slot → check in → see token/position/estimate.
2. Log in as the doctor → call next → start → complete; add an emergency; report a delay.
3. Watch the patient page update in real time.
4. Log in as the hospital admin → view schedules, appointments, queues.
5. Log in as the platform admin → register a hospital and create its admin.

---

## 10. Testing strategy

### Unit tests (no database)

`node --test server/tests/dsa/*.test.js`

- **MinHeap:** ordering by priority then token; peek; heapify; size/isEmpty; random insertion/extraction compared with a sorted array; remove.
- **FIFOQueue:** enqueue/dequeue order; peek; size; empty; remove.
- **PatientQueue:** emergency before normal; FIFO tie-break; position; remove/cancel; rebuild.
- **QueueCalculator:** position 1 for next; estimate with delay and current patient; effective average; empty queue.
- **QueueManager:** independent doctor queues; O(1) lookups; call-next/current transitions; DSA snapshot; operation log.
- **Consistency test:** for a normal-only queue, repeated heap extraction yields exactly the FIFO order; adding an emergency changes the next extraction but not normal relative order.

### Integration tests (temporary SQLite database)

`node --test server/tests/integration/api.test.js`

- Use a separate `server/prisma/test.db` (gitignored), `prisma db push`, minimal seed.
- Exercise: register/login, role rejection, hospital/doctor discovery, slot availability, booking, duplicate booking 409, check-in/token generation, queue position, call-next, complete, emergency priority, cancel, authorization scoping.
- Never touches the development database.

### Build and manual QA

- `npm --prefix client run build` for compile errors.
- Role-by-role walkthrough on desktop + narrow viewport.
- Two-browser Socket.IO test: doctor calls patient, patient page updates without refresh.
- Restart the backend with active queue entries and confirm queues rebuild from SQLite.
- Verify `server/prisma/mediqueue.db` persists after restart.

---

## 11. Implementation phases

Each phase ends with a short report, test/build results, remaining work, and a **stop for your approval**. No phase is skipped.

### Phase 1 — Project setup, folders, SQLite + Prisma
- Root scripts, `.gitignore`, `scripts/setup-env.js`.
- Server + client package manifests and folder skeleton.
- Prisma schema, first migration, database file at `server/prisma/mediqueue.db`.
- Prisma client singleton, Express app, health endpoint, error handler.
- Minimal seed (one account per role) to validate auth later; full seed in Phase 10.
- **Verify:** install, `prisma migrate dev`, generate, seed, server starts, DB file exists, health returns OK.
- **Risk checkpoint:** confirm Prisma 6 + Node 25 works; otherwise recommend Node 22 LTS.

### Phase 2 — Authentication and RBAC
- Register/login/me; bcrypt hashing; JWT; auth + role middleware; scoped identity loading (doctorId/hospitalId).
- Frontend AuthContext, login/register pages, protected routes, role-based shell.
- **Verify:** unit/API checks for valid login, wrong password, missing/invalid token, wrong-role access.

### Phase 3 — Hospital and doctor management
- Public hospital/doctor discovery APIs and pages.
- Hospital admin doctor CRUD (create user + doctor, edit, deactivate).
- Schedule CRUD and validation.
- Hospital profile edit.
- **Verify:** hospital admin cannot see/modify another hospital; public pages search/filter correctly.

### Phase 4 — Appointment booking and scheduling
- Slot generation from schedules; availability; booking transaction with `slotKey`; cancellation; my-appointments API/UI.
- Duplicate booking prevention and past-slot rejection.
- **Verify:** book, duplicate 409, cancel frees slot, future/past rules.

### Phase 5 — Custom DSA queue engine + unit tests
- `MinHeap`, `FIFOQueue`, `PatientQueue`, `QueueCalculator`, `QueueManager`, `index.js`.
- QueueService: startup rebuild, check-in/token generation, call-next/start/complete/no-show/cancel/emergency/delay, locks, transactions.
- Doctor queue APIs + DSA snapshot endpoint.
- Full DSA unit test suite.
- **Verify:** all DSA tests pass; API flow check-in → call → complete; restart rebuild test.

### Phase 6 — Patient dashboard
- Patient dashboard, appointments page, booking UI polish, check-in action, live queue page, notifications.
- REST polling first; Socket.IO comes in Phase 9.
- **Verify:** patient can complete the full journey; positions/estimates match server calculations.

### Phase 7 — Doctor dashboard
- Doctor dashboard, today's appointments, patient info, live queue controls, delay management.
- DSA demonstration panel with heap array, FIFO comparison, operation log, complexity table.
- **Verify:** call/start/complete/no-show/emergency/delay all update DB + queue correctly.

### Phase 8 — Hospital and platform admin dashboards
- Hospital dashboard, doctor management, schedule management, appointment list, queue monitoring.
- Platform dashboard, hospital registration, hospital admin creation/management.
- **Verify:** strict hospital scoping; platform admin can register a hospital and log in as its new admin.

### Phase 9 — Socket.IO real-time updates
- Authenticated Socket.IO handshake, rooms, events, reconnect handling.
- Replace/augment polling on patient queue, doctor queue, hospital monitor, notification badge.
- **Verify:** two-browser test for call-next, emergency, delay; unauthorized socket rejected.

### Phase 10 — Integration tests, full demo data, README
- Expand seed to 3 hospitals / 6 doctors / 12 patients / mixed appointments / active queues / delays / notifications.
- Integration test suite on a temporary DB.
- Full README: setup, DB commands, run commands, demo accounts, architecture, DSA explanation, API summary, troubleshooting, limitations.
- Final build + role walkthrough + restart/persistence check.
- **Verify:** fresh-clone-style setup works; all tests pass; README commands are accurate.
- **Completed:** full demo seed (3 hospitals / 6 doctors / 12 patients / 42 schedules / 29 appointments / 10 queue entries / 1 delay / 12 notifications); 44 unit tests and 88 integration tests passing; production build passing; four-role browser walkthrough and restart/persistence check done; README written.

---

## 12. Technical risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Node 25.9 is newer than Prisma 6's tested matrix | Prisma generate/engine may fail | **Verified in Phase 1:** Prisma 6.19.3 generated, migrated and seeded successfully on Node 25.9.0. Fallback to Node 22 LTS remains available if a later issue appears |
| Project lives inside OneDrive | SQLite/`node_modules` file locks or sync conflicts | Recommend pausing OneDrive sync during development; keep DB file local; document. Optionally move the project to `C:\dev\mediqueue` |
| SQLite single-writer concurrency | Simultaneous check-ins/calls could race | WAL mode, `busy_timeout`, per-doctor/date mutex, transactions, unique constraints |
| In-memory queue diverges from DB | Wrong positions after a crash/failed write | DB is source of truth; mutate memory only after commit; rebuild on startup; all mutations through QueueService |
| Timezone/date parsing bugs | Wrong "today", slots, tokens | Store date/time as strings; use local date-part helpers; document same-machine assumption |
| Slot rebooking after cancellation | Unique constraint blocks freed slot | `slotKey` nullable; set to `null` on cancellation |
| Token/FIFO mismatch | Wrong ordering | Tokens issued at check-in in a locked transaction; heap tie-breaker uses token; consistency test |
| Socket.IO through Vite proxy | WebSocket connection failures | Proxy `/socket.io` with `ws: true`; optional `VITE_SOCKET_URL` direct fallback |
| Tailwind 4 + shadcn assumptions | Component setup friction | Use official `@tailwindcss/vite` plugin and local primitives; no CLI |
| Native `bcrypt` build failure on Windows | Install failure | Use pure-JS `bcryptjs` |
| External fonts/images unavailable offline | Broken UI | System fonts, CSS/initials avatars, bundled lucide icons |
| Port conflicts (4000/5173) | Dev servers fail | Ports configurable via `.env`; README troubleshooting |
| One hospital admin per hospital | Platform admin cannot add a second admin | Documented simplification; join table can be added later |
| Emergency walk-in patients | Doctor cannot add unregistered patients | v1 searches registered patients only; documented; can add walk-in accounts later |
| Demo data date drift | Empty "today" after seeding on another day | Seed dates relative to run time; document re-seeding |

---

## 13. Explicitly out of scope (v1)

- Payments, billing, insurance.
- Medical records, prescriptions, lab reports, documents.
- Video consultation, chat, SMS/email/push notifications.
- Multiple administrators per hospital.
- Unregistered walk-in emergency accounts.
- Password reset via email, 2FA, refresh tokens.
- Deployment, Docker, cloud hosting, GitHub publishing.
- Dark mode, multi-language, complex analytics.
- Enterprise audit logging and rate limiting.

These can be added later without changing the core architecture.

---

## 14. Setup and run commands (preview)

From the project root:

```powershell
# One-time setup: installs both apps, creates server/.env with a random JWT secret,
# applies migrations, generates Prisma Client, seeds demo data
npm run setup

# Terminal 1 — backend (http://localhost:4000)
npm run dev:server

# Terminal 2 — frontend (http://localhost:5173)
npm run dev:client
```

Useful database/test commands:

```powershell
npm --prefix server run db:seed      # reset + recreate demo data
npm --prefix server run db:reset     # reapply migrations + seed
npm --prefix server run db:studio    # inspect SQLite in Prisma Studio
npm test                             # DSA unit tests
npm --prefix server run test:api     # integration tests on a temp DB
npm --prefix client run build        # production build check
```

Environment (`server/.env`, generated, gitignored):

```env
DATABASE_URL="file:./mediqueue.db"
JWT_SECRET="<64 random hex characters>"
JWT_EXPIRES_IN="12h"
PORT=4000
CLIENT_ORIGIN="http://localhost:5173"
DEMO_PASSWORD="MediQueue@123"
```

`DATABASE_URL` is resolved relative to `server/prisma/schema.prisma`, producing exactly `server/prisma/mediqueue.db`.

---

## 15. Approval checklist

Please confirm or adjust these decisions before I start Phase 1:

1. **Prisma 6.19.3** (pure JavaScript client) instead of Prisma 7/8 (TypeScript + native adapter).
2. **Local shadcn-style UI primitives** instead of the official shadcn CLI/Radix.
3. **Tokens issued at check-in**, so FIFO means actual arrival order.
4. **Emergency patients must already be registered** (search + select; no walk-in account creation).
5. **One hospital admin per hospital.**
6. **Demo passwords live in `server/.env`** and are documented in the README; JWT secret is generated.
7. **Node 25.9 is acceptable** to try; if Prisma 6 fails, we switch to Node 22 LTS.

Once approved, I will implement **Phase 1 only**, run the verification steps, report results, and stop for approval before Phase 2.
