import { EJSON } from 'bson'

/**
 * Converts a BSON-bearing value into a plain JSON-safe structure using relaxed
 * Extended JSON, so it can travel over a normal `application/json` response.
 * ObjectIds become `{ $oid }`, dates become `{ $date }`, numbers stay numbers.
 */
export function toJsonSafe<T>(value: T): unknown {
  if (value === undefined) return undefined
  return JSON.parse(EJSON.stringify(value as never))
}

/** Pretty-prints a BSON-bearing value as relaxed Extended JSON text. */
export function stringifyDoc(value: unknown, indent = 2): string {
  return EJSON.stringify(value as never, undefined, indent)
}

/** Serializes an array of documents as newline-delimited Extended JSON. */
export function toNdjson(docs: unknown[]): string {
  return docs.map((doc) => EJSON.stringify(doc as never)).join('\n')
}

/** Parses newline-delimited Extended JSON back into documents. */
export function fromNdjson(text: string): unknown[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => EJSON.parse(line))
}

/** Flattens nested documents into `a.b.c` paths for CSV export and schema views. */
export function flatten(value: unknown, prefix = '', out: Record<string, unknown> = {}) {
  if (value === null || typeof value !== 'object') {
    out[prefix || 'value'] = value
    return out
  }
  if (Array.isArray(value)) {
    out[prefix] = JSON.stringify(value)
    return out
  }
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length === 1 && keys[0].startsWith('$')) {
    out[prefix] = record[keys[0]]
    return out
  }
  for (const key of keys) {
    const path = prefix ? `${prefix}.${key}` : key
    const child = record[key]
    if (child !== null && typeof child === 'object' && !Array.isArray(child)) {
      flatten(child, path, out)
    } else if (Array.isArray(child)) {
      out[path] = JSON.stringify(child)
    } else {
      out[path] = child
    }
  }
  return out
}

/** Human readable byte size. */
export function formatBytes(bytes: number | undefined | null): string {
  if (bytes === undefined || bytes === null || Number.isNaN(bytes)) return '—'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  return `${value >= 100 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`
}

/** Compact number formatting for counts. */
export function formatCount(value: number | undefined | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('en-US').format(value)
}

/** Describes the BSON type of a relaxed-EJSON value for schema analysis. */
export function bsonTypeOf(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'string') return 'string'
  if (typeof value === 'boolean') return 'bool'
  if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'double'
  if (typeof value === 'object') {
    const keys = Object.keys(value as object)
    if (keys.length === 1) {
      const marker = keys[0]
      const map: Record<string, string> = {
        $oid: 'objectId',
        $date: 'date',
        $numberLong: 'long',
        $numberInt: 'int',
        $numberDouble: 'double',
        $numberDecimal: 'decimal',
        $binary: 'binary',
        $uuid: 'uuid',
        $timestamp: 'timestamp',
        $regularExpression: 'regex',
        $minKey: 'minKey',
        $maxKey: 'maxKey',
        $code: 'javascript',
      }
      if (map[marker]) return map[marker]
    }
    return 'object'
  }
  return 'unknown'
}
