# Schedule Builder

A single-user web app for building event schedules (agendas): define tracks and time slots, place sessions on a grid or a table, brand the result, and export it. Everything runs in the browser. There is no backend; data lives in JSON files you save and open, plus an automatic copy in `localStorage`.

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
| `npm run e2e` | Build, serve with `vite preview` and run the real-browser tests in `e2e/` (Playwright, Chromium from `PLAYWRIGHT_BROWSERS_PATH`) |
| `npm run screenshot`| Render the Cairo sample and screenshot it next to `reference/` into `test-results/` (needs Chromium; uses `PLAYWRIGHT_BROWSERS_PATH`) |

## Data model

The whole document is a `Schedule`, defined as zod schemas in [`src/model/schema.ts`](src/model/schema.ts) (TypeScript types are inferred from them):

- `event`: title, date, timezone, venue, notes and optional highlight, url, status.
- `branding`: logo (data URI), colours, fonts, theme, motion.
- `mode`: `track-grid` or `table`.
- `columns`: the track columns of the grid and, in table mode, the table's own columns. Times are `"HH:MM"` (24h), dates `"YYYY-MM-DD"`.
- `items`: the sessions of the track grid, placed by **absolute time** and track: `{ id, columnIds, start, end, title, speaker?, tag?, variant, continuationLabel?, note? }` with `start < end`. There are no rows in the grid: the renderer derives its time slots from the items (one slot per distinct start, ending at the earliest end among the items that start there; longer items show a "continues" ghost in the free cells below them).
- `rows`: used **only by table mode** (time column, cells, row notes). A grid-only schedule keeps it empty; the first switch to a table with no rows creates them from the grid's slots.
- `speakers`.

Cross-field rules (ids unique per collection, items point at existing columns, start before end, and **two items that share a column never overlap in time** — half-open, so back-to-back is fine) are enforced in the schema. `parseSchedule` in `src/model/validate.ts` migrates then validates and returns readable `path: message` errors instead of throwing; on success it also returns `warnings: string[]` for anything a migration had to drop or adjust (the app shows them once).

## Renderer and editor

- `src/render/` is a pure function from `Schedule` to an HTML string (`renderAgendaBody`, `renderDocument`, `agendaCss`). It escapes all user text, sanitises fonts, only emits `http(s)` links and `data:image/` images, and ships no scripts. The preview iframe and the future HTML export use the same code.
- `src/editor/ops.ts` holds the pure, immutable editing operations (columns, table rows, items). Item ops work on times: `addItem(columnIds, start, end, partial)`, `moveItem(id, start, columnDelta | firstColumnId)`, `resizeItem(id, {start?, end?})`, `setItemColumns(id, first, last)`, `duplicateItem`. An op returns the same object when it is refused (overlap, out of range, nothing to do), so the UI disables controls with `op(schedule, ...) === schedule`.
- `src/App.tsx` and `src/shell/` are the app shell (top bar, Export dialog); `src/ui/` holds the shared pieces (tokens live at the top of `src/index.css`; modal, confirm dialog, toasts, menu, sections, segmented control).
- `src/editor/*.tsx` are the sidebar sections (event, branding, labels, speakers), the table editor and the live preview. `src/editor/board/` is the calendar-style board that edits the track grid, and `src/editor/useHistory.ts` is the app-wide undo history.
- `src/samples/cairo.ts` is the Developers Day Cairo seed behind the *Sample event* card in the New… gallery.

### Branding, theme, motion and locale

- `branding` (logo and height, light and optional dark colours, fonts and Google Fonts families, theme, motion) is edited in the **Branding** panel. The dark palette is derived from the light one in `src/render/theme.ts` unless `darkColors` is set. Defaults for colours and fonts live in `src/model/brandDefaults.ts`.
- Dark mode follows the reference pattern: variables under `prefers-color-scheme:dark` and `[data-theme="dark"]`. `renderDocument(schedule, { forceTheme })` overrides the theme for the editor preview.
- Motion is CSS only, wrapped in `prefers-reduced-motion: no-preference` and disabled for print. Nothing is emitted when motion is off.
- `event.locale`, `direction` and `timeFormat` drive `<html lang dir>`, the date and time formatting (`src/render/locale.ts`) and the built-in labels for en, ar and fr (`src/render/labels.ts`). All new schema fields are optional, so existing v1 files stay valid.

### Table mode

In the editor the table is a light spreadsheet: borderless inputs that show a border on hover and focus, Tab along a row, Enter down a column (Enter on the last row adds one), rows reordered by their drag handle (or Alt+Up/Down on it).

`mode: 'table'` renders one flat table: a time column (from `row.start`/`row.end`), then the non-track columns (`text`, `time`, `person`, `tag`) with values in `row.cells[columnId]`. Track-grid mode uses only `type: 'track'` columns and items; both sets live in `columns`, so switching mode (`setMode`) never deletes anything. Person cells that match a speaker name (case-insensitive) show the speaker's avatar; tag cells are comma-separated chips in the column colour; time cells follow the event's locale and 12h/24h setting. On narrow screens each row becomes a card with the column names as labels. The Now badge, motion, RTL, export, import and print work as in grid mode.

### Templates

- **New…** opens a gallery: *Start blank*, five built-in *Templates* (conference with two tracks, single-track meetup, workshop day, team offsite, Arabic conference) and *My templates*. Each card has a live, scaled, script-free preview of the rendered page. Choosing one asks before replacing a schedule that has changes, then loads a fresh copy (`instantiate`: every id regenerated, all references remapped, the date set to today in the template's timezone). All built-in content is generic placeholder text.
- **Save as template…** stores the current schedule in `localStorage` (`schedule-builder:templates:v1`). Unticking *Include sessions, speakers and cell content* keeps the event shell, branding, labels, language, mode, columns, row times and notes and clears item titles, speakers and cells. If the browser is full you get a message and can still use *Export template file*.
- My templates can be renamed, deleted (with confirmation) and exported. **Open…** recognises template files and offers *Add to My templates* or *Open as a schedule*.
- **Template file format** (`<name>.template.json`):

  ```json
  { "kind": "schedule-template", "version": 1,
    "template": { "name": "…", "description": "…", "schedule": { "version": 2, "…": "a normal schedule" } } }
  ```

  The schedule is validated like any other. The code lives in `src/templates/` (`file.ts`, `instantiate.ts`, `strip.ts`, `store.ts`, `builtin/`, and the dialogs).

### Export and re-import

- **Export › HTML** (`src/export/exportHtml.ts`) writes one file: the `renderDocument` page, the schedule as `<script type="application/json" id="schedule-data">` (with `<`, `>`, `&`, U+2028/9 escaped), a Content-Security-Policy meta, and a small ES5 script (`nowScript.ts`) that adds `now` to the cards running at the current time in the event's timezone. Fonts can be embedded for offline use (`embedFonts.ts` fetches Google Fonts limited to the characters on the page, capped at 3 MB); if that fails the file keeps the Google Fonts link and the editor says why.
- **Export › PDF** prints that page through a hidden iframe; the print CSS forces the light palette, sets A4 with 12 mm margins, avoids breaking cards and prints the event link's address.
- **Open…** reads `.json` or an exported `.html`/`.htm` (decided by content, never executing the file) via `src/persistence/importFile.ts`.

### The app shell

A slim top bar: the app name, a **File** menu (New…, Open…, Save JSON, Save as template…), **Undo** / **Redo**, **Edit | Split | Preview**, the autosave status (*Saved*, or *Saving…* only if a save takes over 400 ms) and **Export** (HTML with the optional embedded fonts, or PDF). The window is three regions that each scroll on their own and never scroll the page: the settings sidebar (Event, Branding, Labels and Speakers, one section open at a time), the main working area (the board, or the table; the Track grid | Table switch is the start of the board's own bar, and in table mode it is followed by a strip of column chips: click one to rename it or change its type and colour, drag to reorder, **+ Column** to add) and, in Split, the preview. Wide windows (1280px and up) start in Split, others in Edit. Under 900px the sidebar becomes a drawer behind a Settings button and the preview is a tab; on a phone the board bar is a single row (mode switch, an icon **+** for Add session, and a **⋯** menu with + Track and Zoom). **Sample event** is a card in the New… gallery.

Choosing a template, opening a file and deleting things that Undo can restore never ask first: they show a toast with **Undo**. Only what Undo cannot bring back (deleting a saved template) asks, with the app's own accessible confirm dialog (`useConfirm`).

### The board (track-grid editing)

Time runs down the page, tracks are columns, sessions are cards. Geometry (minutes <-> pixels, 5-minute snapping, the visible range, and the previews of every gesture) is pure code in `src/editor/board/geometry.ts`; the DOM wiring is in `Board.tsx`. Pointer Events with pointer capture, no drag library; while dragging only a preview element is written (no React state), and the schedule changes once on drop.

- **Create:** drag on empty space (across tracks to span them), or click for a 30 minute session. On a touch screen a tap creates the session and a long press (350 ms) then a drag draws one; a swipe still scrolls. It opens its editor with the title focused; a new session whose title is still empty when the editor closes (Esc or click away) is discarded without a trace in the history.
- **Move:** drag a card body: the card itself follows the pointer, its origin shows a dashed placeholder and the snapped landing spot a light outline. **Resize:** drag its top or bottom edge (time) or its side edges (tracks); the card stretches as you drag. A drop that would overlap or leave the day turns the preview red and reverts; Esc cancels any gesture. The board scrolls when you drag near its edges.
- **Edit:** double-click or Enter opens the editor next to the card (never over it; a bottom sheet on a phone): title, speaker (a combobox over the speakers list that can add a new name to it), variant, start/end, span all tracks, continuation label, note, delete. A new session stays out of the preview until it has a title. **Delete** or Backspace removes a card with an Undo toast.
- **Keyboard:** Tab visits cards in time order; arrows move by 5 minutes / one track; Shift+Up/Down resizes the end; Ctrl/Cmd+D duplicates below; changes are announced in an `aria-live` region.
- **Tracks:** double-click a header to rename, drag it to reorder, use its menu for colour and delete (undoable), `+ Track` to add one. For right-to-left events the whole board is mirrored (gutter and first track on the right; Left and Right arrows follow what you see).
- **Undo / redo** (top bar, Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z, Ctrl+Y) cover every edit in the app, up to 100 steps. A drag is one step; typing in a field is one step.

## File format and migrations

Saved files are pretty-printed JSON with a top-level `version` (currently 2). On load, `migrate` (`src/model/migrate.ts`) upgrades older files step by step to `CURRENT_VERSION`, and rejects missing or newer versions with a clear error. Adding a version means bumping `CURRENT_VERSION`, adding one upgrader function, and updating the schema.

**Version 1 → 2** (grid items by time): an item's `start` is its override or its row's start; its `end` is its override or the end of the last row it spanned (`rowSpan`); `rowId` and `rowSpan` are dropped. A grid-mode `row.note` moves to `note` on the first item of that row in column order (a note on a row with no items is dropped, with a warning). Rows stay in the file for table mode. Version 1 allowed an item to run on top of a neighbour's cell; version 2 forbids overlaps, so the earlier item is shortened to end where the later one starts, with a warning (the Cairo sample's 14:00 keynote, listed until 14:30, now ends at 14:20 when the first sessions start).

Autosave uses the `localStorage` key `schedule-builder:v1` and is validated the same way on load; corrupt data is ignored.

## Roadmap

- [x] **M1** Foundation: scaffold, schema, validation, autosave, JSON open/save
- [x] **M2** Track-grid editor and renderer
- [x] **M3** Branding, dark theme, motion, locale and RTL
- [x] **M4** Export PDF/HTML and re-import
- [x] **M5** Table mode
- [x] **M6** Templates
- [x] **Direct manipulation**: time-based model, calendar board, undo/redo, app shell, speakers, table spreadsheet, touch and RTL

## User guide

1. **Create.** Open **File › New…** and pick a template, the *Sample event* or a blank schedule. Edit the event details in the sidebar, then draw sessions on the board (or fill the table). Switch between *Track grid* and *Table* at the top; nothing is lost when you switch.
2. **Brand.** In **Branding** set the logo, colours (and optionally dark colours), fonts, theme and motion. In **Event** choose the language, direction and 12/24-hour times; the **Labels** section changes the fixed wording on the page. The preview on the right updates as you type, and *Preview: Light | Dark* shows both themes.
3. **Export.** **Export** offers an HTML page (one self-contained file, fonts embedded for offline use when possible, that highlights what is happening now) or a PDF (the print dialog; choose *Save as PDF*). **File › Save JSON** keeps the editable data.
4. **Re-import.** **File › Open…** reads a saved `.json`, an exported `.html`, or a `.template.json`. Your work is also autosaved in the browser.
5. **Reuse.** **File › Save as template…** keeps a schedule (or just its shell) under *My templates* for next time.

