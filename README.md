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

## Data model

The whole document is a `Schedule`, defined as zod schemas in [`src/model/schema.ts`](src/model/schema.ts) (TypeScript types are inferred from them):

- `event`: title, date, timezone, venue, notes and optional highlight, url, status.
- `branding`: logo (data URI), colours, fonts, theme, motion.
- `mode`: `track-grid` or `table`.
- `columns` and `rows`: the grid axes. Times are `"HH:MM"` (24h), dates `"YYYY-MM-DD"`.
- `items`: sessions placed on a row and one or more columns, optionally spanning rows or overriding times.
- `speakers`.

Cross-field rules (ids unique per collection, items point at existing rows and columns, start before end, `rowSpan` fits) are enforced in the schema. `parseSchedule` in `src/model/validate.ts` migrates then validates and returns readable `path: message` errors instead of throwing.

## File format and migrations

Saved files are pretty-printed JSON with a top-level `version`. On load, `migrate` (`src/model/migrate.ts`) upgrades older files step by step to `CURRENT_VERSION`, and rejects missing or newer versions with a clear error. Adding version 2 means bumping `CURRENT_VERSION`, adding one upgrader function for `1`, and updating the schema.

Autosave uses the `localStorage` key `schedule-builder:v1` and is validated the same way on load; corrupt data is ignored.

## Roadmap

- [x] **M1** Foundation: scaffold, schema, validation, autosave, JSON open/save
- [ ] **M2** Track-grid editor and renderer
- [ ] **M3** Branding and motion
- [ ] **M4** Export PDF/HTML and re-import
- [ ] **M5** Table mode
- [ ] **M6** Templates
