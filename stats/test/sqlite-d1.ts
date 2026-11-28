// D1 finto sopra node:sqlite (copia di linerfm/worker/test/sqlite-d1.ts): le query vere girano su SQLite vero.
type Row = Record<string, unknown>;
export interface SqliteD1 { d1: D1Database; all: (sql: string) => Row[]; exec: (sql: string) => void }

export async function sqliteD1(ddl: string): Promise<SqliteD1> {
  // getBuiltinModule e non import: vite non conosce node:sqlite, e il worker non ha i tipi di Node
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- modulo di Node senza tipi qui
  const { DatabaseSync } = (globalThis as any).process.getBuiltinModule("node:sqlite");
  const s = new DatabaseSync(":memory:");
  s.exec(ddl);
  const bound = (sql: string, b: unknown[]) => ({
    run: async () => { s.prepare(sql).run(...b); return {}; },
    first: async () => (s.prepare(sql).get(...b) as Row | undefined) ?? null,
    all: async () => ({ results: s.prepare(sql).all(...b) as Row[] }),
  });
  const d1 = {
    prepare: (sql: string) => ({ bind: (...b: unknown[]) => bound(sql, b), ...bound(sql, []) }),
    batch: async (stmts: { run: () => Promise<unknown> }[]) => { for (const x of stmts) await x.run(); return []; },
  } as unknown as D1Database;
  return { d1, all: (sql) => s.prepare(sql).all() as Row[], exec: (sql) => s.exec(sql) };
}
