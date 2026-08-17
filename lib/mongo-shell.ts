import { EJSON } from 'bson'

/**
 * A small, dependency-free parser for mongo-shell style commands.
 *
 * It deliberately does NOT evaluate JavaScript. Input is tokenized and rewritten
 * into strict Extended JSON, then handed to `EJSON.parse`. That keeps arbitrary
 * code execution off the server while still accepting the shell syntax people
 * are used to typing (unquoted keys, single quotes, ObjectId(), ISODate(), /re/i).
 */

const WS = /\s/
const IDENT_START = /[A-Za-z_$]/
const IDENT_PART = /[A-Za-z0-9_$.]/

class ParseError extends Error {}

export function isParseError(error: unknown): error is ParseError {
  return error instanceof ParseError
}

function readString(src: string, start: number): { value: string; next: number } {
  const quote = src[start]
  let i = start + 1
  let value = ''
  while (i < src.length) {
    const c = src[i]
    if (c === '\\') {
      const esc = src[i + 1]
      switch (esc) {
        case 'n':
          value += '\n'
          break
        case 't':
          value += '\t'
          break
        case 'r':
          value += '\r'
          break
        case 'b':
          value += '\b'
          break
        case 'f':
          value += '\f'
          break
        case 'u': {
          value += String.fromCharCode(Number.parseInt(src.slice(i + 2, i + 6), 16))
          i += 6
          continue
        }
        default:
          value += esc
      }
      i += 2
      continue
    }
    if (c === quote) return { value, next: i + 1 }
    value += c
    i++
  }
  throw new ParseError('Unterminated string literal.')
}

function readRegex(src: string, start: number) {
  let i = start + 1
  let pattern = ''
  let inClass = false
  while (i < src.length) {
    const c = src[i]
    if (c === '\\') {
      pattern += c + (src[i + 1] ?? '')
      i += 2
      continue
    }
    if (c === '[') inClass = true
    else if (c === ']') inClass = false
    else if (c === '/' && !inClass) {
      i++
      let flags = ''
      while (i < src.length && /[a-z]/.test(src[i])) {
        flags += src[i]
        i++
      }
      return { pattern, flags, next: i }
    }
    pattern += c
    i++
  }
  throw new ParseError('Unterminated regular expression literal.')
}

/** Reads a balanced `( ... )` group starting at `start` and returns its inner text. */
function readParens(src: string, start: number): { inner: string; next: number } {
  let depth = 0
  let i = start
  while (i < src.length) {
    const c = src[i]
    if (c === '"' || c === "'") {
      i = readString(src, i).next
      continue
    }
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') {
      depth--
      if (depth === 0) return { inner: src.slice(start + 1, i), next: i + 1 }
    }
    i++
  }
  throw new ParseError('Unbalanced parentheses in command.')
}

function unquote(raw: string): string {
  const t = raw.trim()
  if (!t) return ''
  if (t[0] === '"' || t[0] === "'") return readString(t, 0).value
  return t
}

function ctorToJson(name: string, inner: string): string {
  const args = splitTopLevel(inner)
  const first = args[0] !== undefined ? unquote(args[0]) : ''
  switch (name) {
    case 'ObjectId':
    case 'ObjectID':
      return JSON.stringify({ $oid: first })
    case 'ISODate':
    case 'Date':
      return JSON.stringify({ $date: first || new Date().toISOString() })
    case 'NumberInt':
      return JSON.stringify({ $numberInt: String(first) })
    case 'NumberLong':
      return JSON.stringify({ $numberLong: String(first) })
    case 'NumberDecimal':
      return JSON.stringify({ $numberDecimal: String(first) })
    case 'NumberDouble':
      return JSON.stringify({ $numberDouble: String(first) })
    case 'UUID':
      return JSON.stringify({ $uuid: first })
    case 'BinData':
      return JSON.stringify({
        $binary: { base64: unquote(args[1] ?? ''), subType: (Number(first) || 0).toString(16).padStart(2, '0') },
      })
    case 'Timestamp':
      return JSON.stringify({ $timestamp: { t: Number(first) || 0, i: Number(unquote(args[1] ?? '0')) || 0 } })
    case 'MinKey':
      return JSON.stringify({ $minKey: 1 })
    case 'MaxKey':
      return JSON.stringify({ $maxKey: 1 })
    case 'RegExp':
      return JSON.stringify({
        $regularExpression: { pattern: first, options: unquote(args[1] ?? '') },
      })
    default:
      throw new ParseError(`Unsupported constructor \`${name}(...)\`.`)
  }
}

/** Splits `a, {b: 1}, [2, 3]` into top-level segments. */
export function splitTopLevel(src: string): string[] {
  const out: string[] = []
  let depth = 0
  let current = ''
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (c === '"' || c === "'") {
      const { next } = readString(src, i)
      current += src.slice(i, next)
      i = next
      continue
    }
    if (c === '(' || c === '[' || c === '{') depth++
    if (c === ')' || c === ']' || c === '}') depth--
    if (c === ',' && depth === 0) {
      out.push(current)
      current = ''
      i++
      continue
    }
    current += c
    i++
  }
  if (current.trim()) out.push(current)
  return out.filter((segment) => segment.trim().length > 0)
}

/** Rewrites relaxed/shell JSON into strict Extended JSON text. */
export function toStrictJson(src: string): string {
  let out = ''
  let i = 0
  const n = src.length

  const lastSignificant = () => {
    for (let k = out.length - 1; k >= 0; k--) {
      if (!WS.test(out[k])) return out[k]
    }
    return ''
  }

  while (i < n) {
    const c = src[i]

    if (WS.test(c)) {
      out += ' '
      i++
      continue
    }

    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++
      continue
    }

    if (c === '/' && src[i + 1] === '*') {
      i += 2
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++
      i += 2
      continue
    }

    if (c === '"' || c === "'") {
      const { value, next } = readString(src, i)
      out += JSON.stringify(value)
      i = next
      continue
    }

    if (c === '/' && ['', ':', ',', '[', '{', '('].includes(lastSignificant())) {
      const { pattern, flags, next } = readRegex(src, i)
      out += JSON.stringify({ $regularExpression: { pattern, options: flags } })
      i = next
      continue
    }

    if (c === ',') {
      let j = i + 1
      while (j < n && WS.test(src[j])) j++
      if (src[j] === '}' || src[j] === ']') {
        i = j
        continue
      }
      out += ','
      i++
      continue
    }

    if (IDENT_START.test(c)) {
      let j = i
      while (j < n && IDENT_PART.test(src[j])) j++
      const ident = src.slice(i, j)

      if (ident === 'new') {
        i = j
        continue
      }

      let k = j
      while (k < n && WS.test(src[k])) k++

      if (src[k] === '(') {
        const { inner, next } = readParens(src, k)
        out += ctorToJson(ident, inner)
        i = next
        continue
      }

      if (src[k] === ':') {
        out += JSON.stringify(ident)
        i = j
        continue
      }

      if (ident === 'true' || ident === 'false' || ident === 'null') {
        out += ident
        i = j
        continue
      }

      out += JSON.stringify(ident)
      i = j
      continue
    }

    out += c
    i++
  }

  return out.trim()
}

/** Parses relaxed JSON / shell object notation into a JS value. */
export function parseRelaxed<T = unknown>(src: string, fallback?: T): T {
  const trimmed = (src ?? '').trim()
  if (!trimmed) {
    if (fallback !== undefined) return fallback
    throw new ParseError('Expected a JSON value but received an empty string.')
  }
  try {
    return EJSON.parse(toStrictJson(trimmed)) as T
  } catch (error) {
    if (error instanceof ParseError) throw error
    throw new ParseError(
      `Could not parse as JSON: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

export type CommandModifier = { name: string; args: unknown[] }

export type ParsedCommand = {
  target: 'collection' | 'database'
  collection?: string
  operation: string
  args: unknown[]
  modifiers: CommandModifier[]
  raw: string
}

type Segment = { name: string; rawArgs?: string }

/** Parses `db.users.find({ a: 1 }).sort({ b: -1 }).limit(10)` into a structured command. */
export function parseCommand(input: string): ParsedCommand {
  const src = input.trim().replace(/;+\s*$/, '')
  if (!src) throw new ParseError('Enter a command to run.')

  let i = 0
  const n = src.length
  const skipWs = () => {
    while (i < n && WS.test(src[i])) i++
  }

  skipWs()
  if (!src.startsWith('db')) {
    throw new ParseError('Commands must start with `db`, e.g. `db.users.find({})`.')
  }
  i += 2

  const segments: Segment[] = []

  while (i < n) {
    skipWs()
    if (i >= n) break

    let name: string
    if (src[i] === '.') {
      i++
      const start = i
      while (i < n && IDENT_PART.test(src[i]) && src[i] !== '.') i++
      name = src.slice(start, i)
      if (!name) throw new ParseError('Expected a property name after `.`.')
    } else if (src[i] === '[') {
      const end = src.indexOf(']', i)
      if (end === -1) throw new ParseError('Unbalanced `[` in command.')
      name = unquote(src.slice(i + 1, end))
      i = end + 1
    } else {
      throw new ParseError(`Unexpected character \`${src[i]}\` in command.`)
    }

    skipWs()
    let rawArgs: string | undefined
    if (src[i] === '(') {
      const { inner, next } = readParens(src, i)
      rawArgs = inner
      i = next
    }

    if (name === 'getCollection' && rawArgs !== undefined) {
      segments.push({ name: unquote(splitTopLevel(rawArgs)[0] ?? '') })
      continue
    }

    segments.push({ name, rawArgs })
  }

  const opIndex = segments.findIndex((segment) => segment.rawArgs !== undefined)
  if (opIndex === -1) {
    throw new ParseError('No operation call found. Did you forget `()`? e.g. `db.users.find({})`.')
  }

  const collectionPath = segments
    .slice(0, opIndex)
    .map((segment) => segment.name)
    .join('.')
  const operationSegment = segments[opIndex]

  const args = splitTopLevel(operationSegment.rawArgs ?? '').map((arg) => parseRelaxed(arg))

  const modifiers: CommandModifier[] = segments.slice(opIndex + 1).map((segment) => ({
    name: segment.name,
    args: splitTopLevel(segment.rawArgs ?? '').map((arg) => parseRelaxed(arg)),
  }))

  return {
    target: collectionPath ? 'collection' : 'database',
    collection: collectionPath || undefined,
    operation: operationSegment.name,
    args,
    modifiers,
    raw: src,
  }
}
