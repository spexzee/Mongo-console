import type { Db, Document, FindCursor } from 'mongodb'
import type { ParsedCommand } from '@/lib/mongo-shell'

const DEFAULT_LIMIT = 200

type ExecResult = {
  kind: 'documents' | 'value'
  documents?: Document[]
  value?: unknown
  count?: number
  truncated?: boolean
}

function asDoc(value: unknown, label: string): Document {
  if (value === undefined) return {}
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a document.`)
  }
  return value as Document
}

function applyCursorModifiers(cursor: FindCursor<Document>, command: ParsedCommand) {
  let limited = false
  for (const modifier of command.modifiers) {
    const [first, second] = modifier.args
    switch (modifier.name) {
      case 'sort':
        cursor.sort(asDoc(first, '.sort()') as never)
        break
      case 'limit':
        cursor.limit(Number(first))
        limited = true
        break
      case 'skip':
        cursor.skip(Number(first))
        break
      case 'project':
      case 'projection':
        cursor.project(asDoc(first, '.project()'))
        break
      case 'collation':
        cursor.collation(asDoc(first, '.collation()') as never)
        break
      case 'hint':
        cursor.hint(first as never)
        break
      case 'maxTimeMS':
        cursor.maxTimeMS(Number(first))
        break
      case 'batchSize':
        cursor.batchSize(Number(first))
        break
      case 'comment':
        cursor.comment(String(first))
        break
      case 'toArray':
      case 'pretty':
      case 'itcount':
        break
      case 'count':
        break
      case 'allowDiskUse':
        cursor.allowDiskUse()
        break
      default:
        if (second !== undefined) break
        throw new Error(`Unsupported cursor modifier \`.${modifier.name}()\`.`)
    }
  }
  return limited
}

/** Executes a parsed shell command against a database. */
export async function executeCommand(db: Db, command: ParsedCommand): Promise<ExecResult> {
  const { operation, args, collection } = command

  if (command.target === 'database') {
    switch (operation) {
      case 'runCommand':
      case 'command': {
        const value = await db.command(asDoc(args[0], 'runCommand()'))
        return { kind: 'value', value }
      }
      case 'stats':
      case 'dbStats': {
        const value = await db.command({ dbStats: 1, scale: 1 })
        return { kind: 'value', value }
      }
      case 'getCollectionNames': {
        const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c: Document) => c.name as string)
        return { kind: 'value', value: names, count: names.length }
      }
      case 'getCollectionInfos':
      case 'listCollections': {
        const infos = await db.listCollections(asDoc(args[0], 'listCollections()')).toArray()
        return { kind: 'documents', documents: infos, count: infos.length }
      }
      case 'createCollection': {
        const name = String(args[0] ?? '')
        if (!name) throw new Error('createCollection() requires a collection name.')
        await db.createCollection(name, asDoc(args[1], 'createCollection() options') as never)
        return { kind: 'value', value: { ok: 1, created: name } }
      }
      case 'dropDatabase': {
        await db.dropDatabase()
        return { kind: 'value', value: { ok: 1, dropped: db.databaseName } }
      }
      case 'serverStatus': {
        const value = await db.admin().serverStatus()
        return { kind: 'value', value }
      }
      case 'ping': {
        const value = await db.command({ ping: 1 })
        return { kind: 'value', value }
      }
      default:
        throw new Error(
          `Unsupported database operation \`db.${operation}()\`. Try \`db.<collection>.${operation}()\` or \`db.runCommand({...})\`.`,
        )
    }
  }

  if (!collection) throw new Error('A collection name is required for this operation.')
  const col = db.collection(collection)

  switch (operation) {
    case 'find': {
      const filter = asDoc(args[0], 'find() filter')
      const projection = args[1] ? asDoc(args[1], 'find() projection') : undefined
      const cursor = col.find(filter, projection ? { projection } : {})
      const limited = applyCursorModifiers(cursor, command)
      const wantsCount = command.modifiers.some((m) => m.name === 'count' || m.name === 'itcount')
      if (wantsCount) {
        const value = await col.countDocuments(filter)
        return { kind: 'value', value, count: value }
      }
      if (!limited) cursor.limit(DEFAULT_LIMIT + 1)
      const documents = await cursor.toArray()
      const truncated = !limited && documents.length > DEFAULT_LIMIT
      if (truncated) documents.pop()
      return { kind: 'documents', documents, count: documents.length, truncated }
    }
    case 'findOne': {
      const doc = await col.findOne(
        asDoc(args[0], 'findOne() filter'),
        args[1] ? { projection: asDoc(args[1], 'findOne() projection') } : {},
      )
      return { kind: 'documents', documents: doc ? [doc] : [], count: doc ? 1 : 0 }
    }
    case 'aggregate': {
      const pipeline = args[0]
      if (!Array.isArray(pipeline)) throw new Error('aggregate() expects an array pipeline.')
      const cursor = col.aggregate(pipeline as Document[], {
        allowDiskUse: true,
        ...(args[1] ? (asDoc(args[1], 'aggregate() options') as never) : {}),
      })
      const documents = await cursor.toArray()
      const truncated = documents.length > DEFAULT_LIMIT * 5
      const sliced = truncated ? documents.slice(0, DEFAULT_LIMIT * 5) : documents
      return { kind: 'documents', documents: sliced, count: sliced.length, truncated }
    }
    case 'countDocuments':
    case 'count': {
      const value = await col.countDocuments(asDoc(args[0], 'countDocuments() filter'))
      return { kind: 'value', value, count: value }
    }
    case 'estimatedDocumentCount': {
      const value = await col.estimatedDocumentCount()
      return { kind: 'value', value, count: value }
    }
    case 'distinct': {
      const field = String(args[0] ?? '')
      if (!field) throw new Error('distinct() requires a field name.')
      const value = await col.distinct(field, asDoc(args[1], 'distinct() filter'))
      return { kind: 'value', value, count: value.length }
    }
    case 'insertOne': {
      const value = await col.insertOne(asDoc(args[0], 'insertOne() document'))
      return { kind: 'value', value }
    }
    case 'insertMany':
    case 'insert': {
      const docs = args[0]
      if (Array.isArray(docs)) {
        const value = await col.insertMany(docs as Document[], { ordered: false })
        return { kind: 'value', value }
      }
      const value = await col.insertOne(asDoc(docs, 'insert() document'))
      return { kind: 'value', value }
    }
    case 'updateOne': {
      const value = await col.updateOne(
        asDoc(args[0], 'updateOne() filter'),
        asDoc(args[1], 'updateOne() update') as never,
        asDoc(args[2], 'updateOne() options') as never,
      )
      return { kind: 'value', value }
    }
    case 'updateMany':
    case 'update': {
      const value = await col.updateMany(
        asDoc(args[0], 'updateMany() filter'),
        asDoc(args[1], 'updateMany() update') as never,
        asDoc(args[2], 'updateMany() options') as never,
      )
      return { kind: 'value', value }
    }
    case 'replaceOne': {
      const value = await col.replaceOne(
        asDoc(args[0], 'replaceOne() filter'),
        asDoc(args[1], 'replaceOne() replacement'),
        asDoc(args[2], 'replaceOne() options') as never,
      )
      return { kind: 'value', value }
    }
    case 'deleteOne': {
      const value = await col.deleteOne(asDoc(args[0], 'deleteOne() filter'))
      return { kind: 'value', value }
    }
    case 'deleteMany':
    case 'remove': {
      const value = await col.deleteMany(asDoc(args[0], 'deleteMany() filter'))
      return { kind: 'value', value }
    }
    case 'findOneAndUpdate': {
      const options = asDoc(args[2], 'options')
      const value = await col.findOneAndUpdate(
        asDoc(args[0], 'filter'),
        asDoc(args[1], 'update') as never,
        { returnDocument: 'after', ...options } as never,
      )
      return { kind: 'value', value }
    }
    case 'findOneAndReplace': {
      const options = asDoc(args[2], 'options')
      const value = await col.findOneAndReplace(asDoc(args[0], 'filter'), asDoc(args[1], 'replacement'), {
        returnDocument: 'after',
        ...options,
      } as never)
      return { kind: 'value', value }
    }
    case 'findOneAndDelete': {
      const value = await col.findOneAndDelete(asDoc(args[0], 'filter'))
      return { kind: 'value', value }
    }
    case 'bulkWrite': {
      const operations = args[0]
      if (!Array.isArray(operations)) throw new Error('bulkWrite() expects an array of operations.')
      const value = await col.bulkWrite(operations as never, { ordered: false })
      return { kind: 'value', value }
    }
    case 'createIndex': {
      const value = await col.createIndex(
        asDoc(args[0], 'createIndex() keys') as never,
        asDoc(args[1], 'createIndex() options') as never,
      )
      return { kind: 'value', value: { createdIndex: value } }
    }
    case 'createIndexes': {
      const specs = args[0]
      if (!Array.isArray(specs)) throw new Error('createIndexes() expects an array of specs.')
      const value = await col.createIndexes(specs as never)
      return { kind: 'value', value }
    }
    case 'dropIndex': {
      const value = await col.dropIndex(String(args[0]))
      return { kind: 'value', value }
    }
    case 'dropIndexes': {
      const value = await col.dropIndexes()
      return { kind: 'value', value }
    }
    case 'getIndexes':
    case 'indexes': {
      const value = await col.indexes()
      return { kind: 'documents', documents: value as Document[], count: value.length }
    }
    case 'stats': {
      const [row] = await col.aggregate([{ $collStats: { storageStats: {} } }]).toArray()
      return { kind: 'value', value: row ?? {} }
    }
    case 'drop': {
      const value = await col.drop()
      return { kind: 'value', value: { ok: value ? 1 : 0, dropped: collection } }
    }
    case 'renameCollection': {
      const target = String(args[0] ?? '')
      if (!target) throw new Error('renameCollection() requires a new name.')
      await col.rename(target, { dropTarget: Boolean(args[1]) })
      return { kind: 'value', value: { ok: 1, renamedTo: target } }
    }
    case 'explain': {
      const value = await col.find(asDoc(args[0], 'filter')).explain()
      return { kind: 'value', value }
    }
    case 'watch':
      throw new Error('Change streams are not supported in the query runner.')
    default:
      throw new Error(`Unsupported collection operation \`.${operation}()\`.`)
  }
}
