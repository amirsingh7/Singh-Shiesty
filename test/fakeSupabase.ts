/**
 * A minimal stand-in for the supabase-js query builder, just enough to
 * record what a call site asked for (table, filters, upsert payload) without
 * a real database. Used to prove code-level user_id discipline — that every
 * write/read path stamps or filters on the real userId it was given, never a
 * shared/blank key. This does NOT prove Postgres RLS itself works; that
 * needs a live two-account check against the real Supabase project (see
 * PHASE1_VERIFICATION.md).
 */
export interface RecordedCall {
  method: string
  args: unknown[]
}

export function makeFakeSupabase() {
  const calls: RecordedCall[] = []

  function makeBuilder(table: string) {
    const record = (method: string, args: unknown[]) => calls.push({ method: `${table}.${method}`, args })
    const builder: {
      upsert: (payload: unknown, opts?: unknown) => typeof builder
      select: (cols?: string) => typeof builder
      eq: (col: string, val: unknown) => typeof builder
      in: (col: string, vals: unknown[]) => typeof builder
      delete: () => typeof builder
      neq: (col: string, val: unknown) => typeof builder
      maybeSingle: () => Promise<{ data: null; error: null }>
      then: (resolve: (v: { data: unknown[]; error: null }) => void) => void
    } = {
      upsert(payload, opts) {
        record('upsert', [payload, opts])
        return builder
      },
      select(cols) {
        record('select', [cols])
        return builder
      },
      eq(col, val) {
        record('eq', [col, val])
        return builder
      },
      in(col, vals) {
        record('in', [col, vals])
        return builder
      },
      delete() {
        record('delete', [])
        return builder
      },
      neq(col, val) {
        record('neq', [col, val])
        return builder
      },
      maybeSingle() {
        record('maybeSingle', [])
        return Promise.resolve({ data: null, error: null })
      },
      then(resolve) {
        resolve({ data: [], error: null })
      },
    }
    return builder
  }

  return {
    from: (table: string) => makeBuilder(table),
    calls,
  }
}
