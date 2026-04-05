<div align="center">
  <img src="./public/logo.png" alt="BitLab Logo" width="120" />

# BitLab

### Offline SQL + PL/SQL Lab Compiler (In-Browser)

<p>
  <img alt="Vite" src="https://img.shields.io/badge/Vite-5.x-646CFF?style=for-the-badge&logo=vite&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React-18-149ECA?style=for-the-badge&logo=react&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
  <img alt="sql.js" src="https://img.shields.io/badge/sql.js-WASM-2D2D2D?style=for-the-badge" />
  <img alt="Tailwind" src="https://img.shields.io/badge/TailwindCSS-3.x-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" />
</p>

<p>
  A full single-page SQL/PL-SQL practice lab that runs entirely in the browser using <code>sql.js</code> + WebAssembly.
  No backend server, no DB install, no runtime setup for students.
</p>
</div>

---

## Overview

BitLab is a browser-based DBMS lab environment designed for fast SQL and PL/SQL experimentation.
It provides:

- A multi-session query workspace with isolated in-memory databases.
- SQL execution with Oracle-style translation and error mapping.
- A custom PL/SQL interpreter for syllabus-oriented constructs.
- Live schema explorer per session with MongoDB collection support.
- Output console with copy + CSV export and JSON syntax highlighting.
- Auto mode detection (`SQL`, `PL/SQL`, `MONGODB`) and editor autocomplete.
- Support for dynamic SQL via `EXECUTE IMMEDIATE`.

The app is optimized for classroom/lab usage where users need Oracle-like ergonomics without provisioning Oracle.

---

## Core Value Proposition

- Offline-first execution model: everything runs in the browser runtime.
- Zero infrastructure dependency: no API server and no external database required.
- Oracle-style learning experience on top of SQLite (`sql.js`) compatibility layer.
- Session isolation model for safe parallel experimentation.

---

## Feature Matrix

| Area | What BitLab Provides |
|---|---|
| Landing Experience | Animated intro, gradient shader background, smooth transition into workbench |
| Session Management | Create, switch, rename, delete sessions with isolated DB state |
| Editor UX | Monospace editor, line numbers, cursor position, run shortcuts, run selection |
| Autocomplete | Keyword/function suggestions from SQL + PL/SQL dictionaries |
| Execution Engine | Statement splitter, Oracle-to-SQLite translation, synthetic command handling |
| PL/SQL Runtime | Variables, loops, IF/ELSIF/ELSE, cursors, SELECT INTO, procedures/functions, exception blocks, EXECUTE IMMEDIATE |
| MongoDB Engine | In-browser NoSQL simulation, CRUD operations, aggregation pipeline, collection explorer |
| Schema Explorer | Auto-refreshed table + column introspection for SQL; Collection + count view for MongoDB |
| Result Handling | ASCII table rendering, message stream, DBMS_OUTPUT rendering, JSON document view |
| Export/Copy | Copy output to clipboard, export result set as CSV |
| Theme System | Dark/light toggle with CSS variable-driven tokens |

---

## High-Level Architecture

```text
React UI (TopBar / Sidebar / Editor / Output)
        |
        | user code + run action
        v
Mode Detection (keywords.ts)
        |
        +--[SQL / PL·SQL]-----> sqlEngine.ts / plsqlInterpreter.ts --> sql.js Database
        |
        +--[MONGODB]----------> mongoEngine.ts ----------------------> mingo (In-Memory)

Schema Introspection (database.ts / mongoEngine.ts) ---> SchemaExplorer
Result Formatting (tableFormatter.ts / OutputConsole.tsx) ---> Output Console
Error Mapping (oracleErrors.ts) ---> Oracle / MongoDB error messages
```

---

## Execution Lifecycle

### 1) Application Boot

1. `src/main.tsx` mounts `App`.
2. `App.tsx` shows `LandingPage` until user clicks **Get Started**.
3. `BitLab.tsx` initializes `sql.js` via `initDatabase()`.
4. Default session (`query_01.sql`) gets its own in-memory DB instance.

### 2) Session Model

Each session owns:

- Session metadata (`id`, `name`, `code`, `mode`)
- Dedicated `sql.js` `Database`
- Dedicated map of stored PL/SQL programs

This means data/schema changes in one session do not affect others.

### 3) Run Pipeline

When user runs code:

1. Current text (or selected/current statement) is read from editor.
2. Mode is detected using regex patterns (`DECLARE`, `BEGIN`, `db.collection`, etc.).
3. SQL mode -> `executeSQL(...)`
4. PL/SQL mode -> `executePLSQL(...)`
5. MONGODB mode -> `mongoEngine.execute(...)`
6. Messages, result table (SQL) or JSON (MongoDB), and raw result payload are stored in state.
7. Schema is re-introspected and sidebar updates.

### 4) Output Delivery

- Last result set is rendered as ASCII table in output console.
- Message panel shows run metadata, success/error/info lines.
- PL/SQL `DBMS_OUTPUT.PUT_LINE` is rendered in console/panel.
- CSV export uses `formatCsv(columns, rows)`.

---

## SQL Engine Details (`src/lib/sqlEngine.ts`)

### Statement Processing

- Normalizes hidden characters (NBSP/zero-width) outside string literals.
- Splits input by semicolon while respecting string literals and block depth (`BEGIN...END`).
- Tracks statement start line for line-aware error messages.

### Oracle-to-SQLite Translation

Current translation includes `SYSDATE` conversions, for example:

- `SYSDATE` -> `DATE('now')`
- `SYSDATE - n` -> `DATE('now', '-n day')`
- `SYSDATE + n` -> `DATE('now', '+n day')`

### Synthetic Command Support

The engine emulates several commands for Oracle-like UX:

- `CREATE DATABASE ...`
- `DROP DATABASE ...`
- `USE ...`
- `SHOW DATABASES`
- `SHOW TABLES`
- `DESC table` / `DESCRIBE table`
- `COMMIT` / `ROLLBACK`
- `GRANT` / `REVOKE` / `CONNECT`

### Result and Message Strategy

- For `SELECT/WITH/PRAGMA`: captures columns + rows and formats ASCII table.
- For DML (`INSERT/UPDATE/DELETE`): reports row modification counts.
- For DDL: emits operation-specific success messages.
- Always appends execution time info.

### Error Mapping

SQLite errors are mapped to Oracle-style messages, such as:

- `no such table` -> `ORA-00942`
- `syntax error` -> `ORA-00900`
- `UNIQUE constraint failed` -> `ORA-00001`

---

## PL/SQL Interpreter Details (`src/lib/plsqlInterpreter.ts`)

This is a custom JavaScript interpreter, not a full Oracle runtime, but it implements major lab-focused constructs.

### Supported Runtime Features

- `DECLARE ... BEGIN ... EXCEPTION ... END`
- Variable declaration + assignment
- `%TYPE` and `%ROWTYPE` declarations (basic behavior)
- `DBMS_OUTPUT.PUT_LINE(...)`
- Conditionals: `IF / ELSIF / ELSE / END IF`
- Loops: `FOR`, `FOR REVERSE`, `WHILE`, `LOOP`, `EXIT`, `EXIT WHEN`
- `SELECT ... INTO ... FROM ...`
- Cursors: `CURSOR`, `OPEN`, `FETCH ... INTO`, `CLOSE`, cursor attributes
- DML execution with implicit SQL cursor attributes (`SQL%ROWCOUNT`, etc.)
- Stored programs:
  - `CREATE [OR REPLACE] PROCEDURE`
  - `CREATE [OR REPLACE] FUNCTION`
  - Invocation via `EXEC proc(...)` or direct `proc(...)`
- Exception handling:
  - Named handlers
  - `NO_DATA_FOUND`
  - `TOO_MANY_ROWS`
  - `WHEN OTHERS`

### Hybrid Script Handling

Interpreter supports mixed scripts:

- SQL prelude before first PL/SQL block is executed through `executeSQL`.
- Trailing SQL after PL/SQL block is also executed through `executeSQL`.

---

## MongoDB Engine Details (`src/lib/mongoEngine.ts`)

BitLab v1.2 introduces a browser-side MongoDB simulation engine powered by `mingo`.

### Supported Operations

- `db.collection.insertOne()`, `insertMany()`
- `db.collection.find()`, `findOne()`
- `db.collection.updateOne()`, `updateMany()`
- `db.collection.deleteOne()`, `deleteMany()`
- `db.collection.aggregate()`
- `db.collection.countDocuments()`
- `db.collection.drop()`
- `db.createCollection()`
- `show collections`

### Features

- Local-first in-memory storage per session.
- Full MongoDB Query Language (MQL) support via `mingo`.
- Automatic collection creation on first insert.
- Document-level syntax highlighting in the Output Console.

---

## UI Composition

### `TopBar`

- Branding, theme toggle, boot-status text, delete-session action, keyboard hint.

### `SessionSidebar`

- Session list with active state and inline rename.
- New session action.
- Embedded schema explorer for active session.

### `CodeEditorPanel`

- Main editing surface.
- Session tabs.
- `Run` and `Run Sel` actions.
- Keyboard shortcuts:
  - `Ctrl + Enter`: run full editor content
  - `Ctrl + Shift + Enter`: run selection/current statement
- Resizable diagnostics panel with message stream.

### `OutputConsole`

- Displays final result table or DBMS output text.
- Clear, copy, and CSV actions.

### Visual Shader Components

- `Grainient.tsx`: landing background shader.
- `Prism.tsx`: reusable OGL prism shader component (currently not mounted in the main app flow).

---

## Data & State Model

Primary state lives in `src/pages/BitLab.tsx`:

- `sessions[]`, `activeId`
- `output`, `messages`
- panel widths (`sidebarWidth`, `outputWidth`)
- `schemaTables`, `dbReady`
- `rawResult` for CSV export

Refs for non-serializable engine objects:

- `dbMapRef: Map<sessionId, Database>`
- `procsMapRef: Map<sessionId, Map<programName, StoredProgram>>`

---

## Project Structure

```text
src/
  components/
    Autocomplete.tsx
    CodeEditorPanel.tsx
    OutputConsole.tsx
    SchemaExplorer.tsx
    SessionSidebar.tsx
    TopBar.tsx
    Grainient.tsx
    Prism.tsx
    ui/                    # shadcn/radix component set
  lib/
    database.ts            # sql.js init + schema introspection
    sqlEngine.ts           # SQL execution layer
    plsqlInterpreter.ts    # PL/SQL interpreter runtime
    keywords.ts            # autocomplete + mode detection
    oracleErrors.ts        # SQLite -> Oracle error mapping
    tableFormatter.ts      # ASCII table + CSV formatting
  pages/
    LandingPage.tsx
    BitLab.tsx
  App.tsx
  main.tsx
```

---

## Local Development

### Prerequisites

- Node.js 18+
- npm (or Bun, but scripts are npm-compatible)

### Install

```bash
npm install
```

### Run Dev Server

```bash
npm run dev
```

Default Vite port is `8080` (see `vite.config.ts`).

### Build

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

### Tests

```bash
npm run test
```

Current test suite includes baseline scaffolding (`vitest` + `jsdom`) and is ready for expansion.

---

## Technology Stack

- Frontend: React 18 + TypeScript + Vite
- Styling: Tailwind CSS + design tokens via CSS custom properties
- SQL Runtime: `sql.js` (SQLite compiled to WebAssembly)
- Graphics: `ogl` shader components for visual branding
- Testing: Vitest (+ Playwright config scaffold)

---

## Known Boundaries

- PL/SQL support is intentionally scoped to common academic/lab constructs.
- Database state is in-memory per browser session and not persisted across refresh by default.
- Oracle compatibility is emulated; this is not a full Oracle engine.

---

## Why BitLab Works Well For Labs

- Students can run SQL and PL/SQL immediately with no machine-specific DB setup.
- Instructors get Oracle-like feedback semantics with faster onboarding.
- Session isolation enables parallel exercises safely in a single UI.
- Strong editor ergonomics keep focus on query logic, not tooling friction.

---

## Author

Developed by [chiragferwani](https://chiragferwani.vercel.app/)

