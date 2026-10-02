/**
 * File-format migrations.
 *
 * Every saved schedule carries a `version`. `migrate` upgrades older files one
 * step at a time until they reach CURRENT_VERSION, so the rest of the app only
 * ever sees the latest shape.
 *
 * To add a version 2:
 *   1. bump CURRENT_VERSION to 2,
 *   2. add `1: (raw) => ({ ...raw, version: 2, /* reshape here *\/ })` to UPGRADERS,
 *   3. update the zod schema's `version` literal.
 */

export const CURRENT_VERSION = 1

type RawSchedule = Record<string, unknown>

/** UPGRADERS[n] converts a version-n document into a version-(n+1) document. */
const UPGRADERS: Record<number, (raw: RawSchedule) => RawSchedule> = {}

export function migrate(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('Schedule file must be a JSON object')
  }
  let doc = raw as RawSchedule
  const version = doc.version
  if (version === undefined) {
    throw new Error('Schedule file has no "version" field')
  }
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new Error(`Invalid schedule version ${JSON.stringify(version)}`)
  }
  if (version > CURRENT_VERSION) {
    throw new Error(
      `Schedule file version ${version} is newer than this app supports (version ${CURRENT_VERSION}). Update the app to open it.`,
    )
  }
  for (let v = version; v < CURRENT_VERSION; v++) {
    const upgrade = UPGRADERS[v]
    if (!upgrade) throw new Error(`No migration available from schedule version ${v}`)
    doc = upgrade(doc)
  }
  return doc
}
