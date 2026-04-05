import mingo from 'mingo'

interface MongoCollection {
  name: string
  documents: Record<string, any>[]
}

interface MongoDatabase {
  collections: Map<string, MongoCollection>
}

export class MongoEngine {
  private db: MongoDatabase = { collections: new Map() }
  private outputBuffer: string[] = []

  clearOutput() { this.outputBuffer = [] }
  getOutput() { return [...this.outputBuffer ] }

  private log(msg: string) { this.outputBuffer.push(msg) }

  execute(command: string): MongoResult {
    const normalized = command.trim()
    return this.parseAndExecute(normalized)
  }

  getCollections(): { name: string; count: number }[] {
    return Array.from(this.db.collections.values()).map(c => ({
      name: c.name,
      count: c.documents.length
    }))
  }

  private getOrCreateCollection(name: string): MongoCollection {
    if (!this.db.collections.has(name)) {
      this.db.collections.set(name, { name, documents: [] })
    }
    return this.db.collections.get(name)!
  }

  private parseAndExecute(cmd: string): MongoResult {
    try {
      // show collections
      if (/^show\s+collections$/i.test(cmd)) {
        return this.showCollections()
      }

      // show dbs
      if (/^show\s+dbs$/i.test(cmd)) {
        return { type: 'info', message: 'BitLabDB (in-memory)' }
      }

      // db.createCollection("name")
      const createMatch = cmd.match(/^db\.createCollection\s*\(\s*["'](\w+)["']\s*\)/)
      if (createMatch) {
        return this.createCollection(createMatch[1])
      }

      // db.collection.method(...)
      const methodMatch = cmd.match(/^db\.(\w+)\.(\w+)\s*\(([\s\S]*)\)\s*$/)
      if (methodMatch) {
        const [, collName, method, argsStr] = methodMatch
        return this.executeMethod(collName, method, argsStr)
      }

      return { type: 'error', message: `Unrecognized command: ${cmd}` }

    } catch (err: any) {
      return { type: 'error', message: err.message }
    }
  }

  private executeMethod(
    collName: string,
    method: string,
    argsStr: string
  ): MongoResult {
    const coll = this.getOrCreateCollection(collName)

    switch (method.toLowerCase()) {

      case 'insertone': {
        const doc = parseMongoArg(argsStr)
        if (!doc._id) doc._id = generateObjectId()
        coll.documents.push(doc)
        return {
          type: 'success',
          message: `{ acknowledged: true, insertedId: "${doc._id}" }`
        }
      }

      case 'insertmany': {
        const docs = parseMongoArg(argsStr)
        if (!Array.isArray(docs)) throw new Error('insertMany requires an array')
        const ids: string[] = []
        docs.forEach(doc => {
          if (!doc._id) doc._id = generateObjectId()
          ids.push(doc._id)
          coll.documents.push(doc)
        })
        return {
          type: 'success',
          message: `{ acknowledged: true, insertedCount: ${docs.length} }`,
          insertedIds: ids
        }
      }

      case 'find': {
        const [filterArg, projectionArg] = splitMongoArgs(argsStr)
        const filter = filterArg ? parseMongoArg(filterArg) : {}
        const query = new mingo.Query(filter)
        let results = coll.documents.filter(doc => query.test(doc))
        if (projectionArg) {
          const proj = parseMongoArg(projectionArg)
          results = applyProjection(results, proj)
        }
        return { type: 'documents', documents: results, count: results.length }
      }

      case 'findone': {
        const filter = argsStr.trim() ? parseMongoArg(argsStr) : {}
        const query = new mingo.Query(filter)
        const result = coll.documents.find(doc => query.test(doc))
        return {
          type: 'document',
          document: result || null
        }
      }

      case 'updateone': {
        const [filterArg, updateArg] = splitMongoArgs(argsStr)
        const filter = parseMongoArg(filterArg)
        const update = parseMongoArg(updateArg)
        const query = new mingo.Query(filter)
        const idx = coll.documents.findIndex(doc => query.test(doc))
        if (idx !== -1) {
          applyUpdate(coll.documents[idx], update)
          return {
            type: 'success',
            message: `{ acknowledged: true, matchedCount: 1, modifiedCount: 1 }`
          }
        }
        return {
          type: 'success',
          message: `{ acknowledged: true, matchedCount: 0, modifiedCount: 0 }`
        }
      }

      case 'updatemany': {
        const [filterArg, updateArg] = splitMongoArgs(argsStr)
        const filter = parseMongoArg(filterArg)
        const update = parseMongoArg(updateArg)
        const query = new mingo.Query(filter)
        let count = 0
        coll.documents.forEach((doc, idx) => {
          if (query.test(doc)) {
            applyUpdate(coll.documents[idx], update)
            count++
          }
        })
        return {
          type: 'success',
          message: `{ acknowledged: true, matchedCount: ${count}, modifiedCount: ${count} }`
        }
      }

      case 'deleteone': {
        const filter = parseMongoArg(argsStr)
        const query = new mingo.Query(filter)
        const idx = coll.documents.findIndex(doc => query.test(doc))
        if (idx !== -1) {
          coll.documents.splice(idx, 1)
          return {
            type: 'success',
            message: `{ acknowledged: true, deletedCount: 1 }`
          }
        }
        return {
          type: 'success',
          message: `{ acknowledged: true, deletedCount: 0 }`
        }
      }

      case 'deletemany': {
        const filter = argsStr.trim() ? parseMongoArg(argsStr) : {}
        const query = new mingo.Query(filter)
        const before = coll.documents.length
        coll.documents = coll.documents.filter(doc => !query.test(doc))
        const deleted = before - coll.documents.length
        return {
          type: 'success',
          message: `{ acknowledged: true, deletedCount: ${deleted} }`
        }
      }

      case 'drop': {
        this.db.collections.delete(collName)
        return { type: 'success', message: `Collection "${collName}" dropped.` }
      }

      case 'countdocuments': {
        const filter = argsStr.trim() ? parseMongoArg(argsStr) : {}
        const query = new mingo.Query(filter)
        const count = coll.documents.filter(doc => query.test(doc)).length
        return { type: 'count', count }
      }

      case 'aggregate': {
        const pipeline = parseMongoArg(argsStr)
        if (!Array.isArray(pipeline)) throw new Error('aggregate requires a pipeline array')
        const agg = new mingo.Aggregator(pipeline)
        const results = agg.run(coll.documents)
        return { type: 'documents', documents: results, count: results.length }
      }

      default:
        return { type: 'error', message: `Unknown method: ${method}` }
    }
  }

  private showCollections(): MongoResult {
    const names = Array.from(this.db.collections.keys())
    if (names.length === 0) {
      return { type: 'info', message: 'No collections found.' }
    }
    return { type: 'list', items: names }
  }

  private createCollection(name: string): MongoResult {
    this.getOrCreateCollection(name)
    return { type: 'success', message: `Collection "${name}" created.` }
  }
}

// Helper functions
function generateObjectId(): string {
  return Math.random().toString(36).substr(2, 24).padEnd(24, '0')
}

function parseMongoArg(str: string): any {
  let json = str.trim()
  // Quote unquoted keys
  json = json.replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":')
  // Handle ObjectId
  json = json.replace(/ObjectId\s*\(\s*["']([^"']+)["']\s*\)/g, '"$1"')
  // Handle ISODate
  json = json.replace(/ISODate\s*\(\s*["']([^"']+)["']\s*\)/g, '"$1"')
  // Handle NumberInt, NumberLong
  json = json.replace(/NumberInt\s*\(\s*(\d+)\s*\)/g, '$1')
  json = json.replace(/NumberLong\s*\(\s*(\d+)\s*\)/g, '$1')
  try {
    return JSON.parse(json)
  } catch {
    throw new Error(`Failed to parse MongoDB argument: ${str}`)
  }
}

function splitMongoArgs(argsStr: string): string[] {
  const args: string[] = []
  let depth = 0
  let current = ''
  for (const char of argsStr) {
    if (char === '{' || char === '[') depth++
    else if (char === '}' || char === ']') depth--
    else if (char === ',' && depth === 0) {
      args.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  if (current.trim()) args.push(current.trim())
  return args
}

function applyUpdate(doc: any, update: any): void {
  if (update.$set) Object.assign(doc, update.$set)
  if (update.$unset) Object.keys(update.$unset).forEach(k => delete doc[k])
  if (update.$inc) {
    Object.entries(update.$inc).forEach(([k, v]) => {
      doc[k] = (doc[k] || 0) + (v as number)
    })
  }
  if (update.$push) {
    Object.entries(update.$push).forEach(([k, v]) => {
      if (!Array.isArray(doc[k])) doc[k] = []
      doc[k].push(v)
    })
  }
}

function applyProjection(docs: any[], proj: any): any[] {
  const include = Object.entries(proj)
    .filter(([, v]) => v === 1)
    .map(([k]) => k)
  const exclude = Object.entries(proj)
    .filter(([, v]) => v === 0)
    .map(([k]) => k)
  return docs.map(doc => {
    if (include.length > 0) {
      const result: any = {}
      include.forEach(k => { if (doc[k] !== undefined) result[k] = doc[k] })
      return result
    }
    if (exclude.length > 0) {
      const result = { ...doc }
      exclude.forEach(k => delete result[k])
      return result
    }
    return doc
  })
}

export interface MongoResult {
  type: 'success' | 'error' | 'documents' | 'document' | 'info' | 'list' | 'count'
  message?: string
  documents?: any[]
  document?: any
  items?: string[]
  count?: number
  insertedIds?: string[]
}

export const mongoEngine = new MongoEngine()
