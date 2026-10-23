import type { sql as SqlTag } from 'drizzle-orm'

import { commitTransaction, initTransaction, killTransaction, type PayloadRequest } from 'payload'

/** The drizzle handle for the request's transaction, when the adapter has one. */
function drizzleOf(req: PayloadRequest, id: number | string | undefined) {
  const db = req.payload.db as unknown as {
    drizzle?: { execute?: (query: unknown) => Promise<unknown> }
    sessions?: Record<string, { db: { execute?: (query: unknown) => Promise<unknown> } }>
    tableNameMap?: Map<string, string>
  }
  return (id !== undefined ? db.sessions?.[String(id)]?.db : db.drizzle) ?? db.drizzle
}

/**
 * Draft saves and the publish serialize on the look's row: a publish reads
 * the saved draft, files its posters and writes the look, and an autosave in
 * between would be lost under it. Postgres takes a row lock for the length of
 * the transaction; other adapters have no equivalent and skip it, which
 * narrows the window to the request rather than closing it.
 */
export async function lockLook(req: PayloadRequest, slug: string, id: number | string) {
  if (req.payload.db.name !== 'postgres') {
    return
  }
  const transactionID = await req.transactionID
  const db = drizzleOf(req, transactionID)
  if (!db?.execute) {
    return
  }
  let sql: typeof SqlTag
  try {
    ;({ sql } = await import('drizzle-orm'))
  } catch {
    // The adapter brings drizzle-orm; without it the lock is skipped.
    return
  }
  const tables = req.payload.db as unknown as { tableNameMap?: Map<string, string> }
  const table = tables.tableNameMap?.get(slug.replaceAll('-', '_')) ?? slug.replaceAll('-', '_')
  await db.execute(sql`SELECT id FROM ${sql.identifier(table)} WHERE id = ${id} FOR UPDATE`)
}

/** Runs `work` in the request's transaction, opening (and settling) one if the request has none. */
export async function inTransaction<T>(req: PayloadRequest, work: () => Promise<T>): Promise<T> {
  const owner = await initTransaction(req)
  try {
    const result = await work()
    if (owner) {
      await commitTransaction(req)
    }
    return result
  } catch (error) {
    if (owner) {
      await killTransaction(req)
    }
    throw error
  }
}
