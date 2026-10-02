# Schedule Builder

A single-user web app for building event schedules (agendas): define tracks and time slots, place sessions on a grid, brand the result, and export it. Everything runs in the browser. There is no backend; data lives in JSON files you save and open, plus an automatic copy in `localStorage`.

`reference/developers-day-cairo.html` is the target look for the rendered schedule.

## Stack

React, Vite, TypeScript (strict), zod for validation, Vitest with jsdom and Testing Library, ESLint (flat config, zero warnings), npm.

## Scripts

| Script              | What it does                                  |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | Start the Vite dev server                     |
| `npm run build`     | Type-check (`tsc -b`) and build to `dist/`    |
| `npm run lint`      | ESLint with `--max-warnings=0`                |
| `npm test`          | Run the Vitest suite once                     |
| `npm run typecheck` | Type-check without emitting                   |
| `npm run verify:export` | Build the exported HTML for the sample and RTL fixture, open each in Chromium with all network aborted, and check data, CSP, fonts and the Now badge |
| `npm run screenshot`| Render the Cairo sample and screenshot it next to `reference/` into `test-results/` (needs Chromium; uses `PLAYWRIGHT_BROWSERS_PATH`) |

## Data model

The whole document is a `Schedule`, defined as zod schemas in [`src/model/schema.ts`](src/model/schema.ts) (TypeScript types are inferred from them):

- `event`: title, date, timezone, venue, notes and optional highlight, url, status.
- `branding`: logo (data URI), colours, fonts, theme, motion.
- `mode`: `track-grid` or `table`.
- `columns` and `rows`: the grid axes. Times are `"HH:MM"` (24h), dates `"YYYY-MM-DD"`.
- `items`: sessions placed on a row and one or more columns, optionally spanning rows or overriding times.
- `speakers`.

Cross-field rules (ids unique per collection, items point at existing rows and columns, start before end, `rowSpan` fits) are enforced in the schema. `parseSchedule` in `src/model/validate.ts` migrates then validates and returns readable `path: message` errors instead of throwing.

## Renderer and editor

- `src/render/` is a pure function from `Schedule` to an HTML string (`renderAgendaBody`, `renderDocument`, `agendaCss`). It escapes all user text, sanitises fonts, only emits `http(s)` links and `data:image/` images, and ships no scripts. The preview iframe and the future HTML export use the same code.
- `src/editor/ops.ts` holds the pure, immutable editing operations (columns, rows, items). An op returns the same object when it is refused, so the UI disables buttons with `op(schedule, ...) === schedule`.
- `src/editor/*.tsx` are the panels (event, columns, grid, item form) and the live preview.
- `src/samples/cairo.ts` is the Developers Day Cairo seed behind **Load sample**.

### Branding, theme, motion and locale

- `branding` (logo and height, light and optional dark colours, fonts and Google Fonts families, theme, motion) is edited in the **Branding** panel. The dark palette is derived from the light one in `src/render/theme.ts` unless `darkColors` is set. Defaults for colours and fonts live in `src/model/brandDefaults.ts`.
- Dark mode follows the reference pattern: variables under `prefers-color-scheme:dark` and `[data-theme="dark"]`. `renderDocument(schedule, { forceTheme })` overrides the theme for the editor preview.
- Motion is CSS only, wrapped in `prefers-reduced-motion: no-preference` and disabled for print. Nothing is emitted when motion is off.
- `event.locale`, `direction` and `timeFormat` drive `<html lang dir>`, the date and time formatting (`src/render/locale.ts`) and the built-in labels for en, ar and fr (`src/render/labels.ts`). All new schema fields are optional, so existing v1 files stay valid.

### Table mode

`mode: 'table'` renders one flat table: a time column (from `row.start`/`row.end`), then the non-track columns (`text`, `time`, `person`, `tag`) with values in `row.cells[columnId]`. Track-grid mode uses only `type: 'track'` columns and items; both sets live in `columns`, so switching mode (`setMode`) never deletes anything. Person cells that match a speaker name (case-insensitive) show the speaker's avatar; tag cells are comma-separated chips in the column colour; time cells follow the event's locale and 12h/24h setting. On narrow screens each row becomes a card with the column names as labels. The Now badge, motion, RTL, export, import and print work as in grid mode.

### Export and re-import

- **Save HTML** (`src/export/exportHtml.ts`) writes one file: the `renderDocument` page, the schedule as `<script type="application/json" id="schedule-data">` (with `<`, `>`, `&`, U+2028/9 escaped), a Content-Security-Policy meta, and a small ES5 script (`nowScript.ts`) that adds `now` to the cards running at the current time in the event's timezone. Fonts can be embedded for offline use (`embedFonts.ts` fetches Google Fonts limited to the characters on the page, capped at 3 MB); if that fails the file keeps the Google Fonts link and the editor says why.
- **Export PDF** prints that page through a hidden iframe; the print CSS forces the light palette, sets A4 with 12 mm margins, avoids breaking cards and prints the event link's address.
- **Open…** reads `.json` or an exported `.html`/`.htm` (decided by content, never executing the file) via `src/persistence/importFile.ts`.

## File format and migrations

Saved files are pretty-printed JSON with a top-level `version`. On load, `migrate` (`src/model/migrate.ts`) upgrades older files step by step to `CURRENT_VERSION`, and rejects missing or newer versions with a clear error. Adding version 2 means bumping `CURRENT_VERSION`, adding one upgrader function for `1`, and updating the schema.

Autosave uses the `localStorage` key `schedule-builder:v1` and is validated the same way on load; corrupt data is ignored.

## Roadmap

- [x] **M1** Foundation: scaffold, schema, validation, autosave, JSON open/save
- [x] **M2** Track-grid editor and renderer
- [x] **M3** Branding, dark theme, motion, locale and RTL
- [x] **M4** Export PDF/HTML and re-import
- [x] **M5** Table mode
- [ ] **M6** Templates
