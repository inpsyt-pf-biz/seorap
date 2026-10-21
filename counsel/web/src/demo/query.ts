// 체험판 전용: supabase-js 의 from().select() 를 메모리 속 표로 흉내 낸다.
// lib/api.ts 가 쓰는 만큼만 한다(칸 고르기·곁 표 끼워 넣기·eq·in·order·single·maybeSingle·건수만 세기).
export type Row = Record<string, unknown>
export type Tables = Record<string, Row[]>

type Field = { name: string; children: Field[] | null }

// 'id, applications(client_name), sessions(id, seq)' → 칸 목록(괄호 안은 끼워 넣을 곁 표)
export function parseSelect(s: string): Field[] {
  let i = 0
  const list = (): Field[] => {
    const out: Field[] = []
    while (i < s.length) {
      while (i < s.length && /[\s,]/.test(s[i])) i++
      if (i >= s.length || s[i] === ')') break
      let name = ''
      while (i < s.length && !/[\s,()]/.test(s[i])) name += s[i++]
      while (i < s.length && /\s/.test(s[i])) i++
      if (s[i] === '(') {
        i++
        out.push({ name, children: list() })
        i++
      } else {
        out.push({ name, children: null })
      }
    }
    return out
  }
  return list()
}

// 곁 표 잇기: row[local] 과 같은 값을 가진 table 의 [foreign] 줄. one 이면 객체 하나(없으면 null), 아니면 배열
type Relation = { table: string; local: string; foreign: string; one: boolean; order?: string }
const child = (table: string, one: boolean, order?: string): Relation => ({ table, local: 'id', foreign: 'purchase_id', one, order })
const parentPurchase: Relation = { table: 'purchases', local: 'purchase_id', foreign: 'id', one: true }
const RELATIONS: Record<string, Record<string, Relation>> = {
  purchases: {
    applications: child('applications', true),
    application_sensitive: child('application_sensitive', true),
    application_marketing: child('application_marketing', true),
    naver_product_orders: child('naver_product_orders', true),
    naver_orderers: child('naver_orderers', true),
    naver_settlements: child('naver_settlements', true),
    purchase_tests: child('purchase_tests', false, 'unit_no'),
    sessions: child('sessions', false, 'seq'),
  },
  naver_product_orders: { purchases: parentPurchase },
  sessions: { purchases: parentPurchase },
}

const ISO = /^\d{4}-\d{2}-\d{2}T/

// Postgres 와 같은 순서: 오름차순은 빈칸이 맨 뒤, 내림차순은 빈칸이 맨 앞. 시각 글자는 시각으로 견준다
function compare(a: unknown, b: unknown, asc: boolean): number {
  if (a === b) return 0
  if (a === null || a === undefined) return asc ? 1 : -1
  if (b === null || b === undefined) return asc ? -1 : 1
  let d: number
  if (typeof a === 'string' && typeof b === 'string') {
    d = ISO.test(a) && ISO.test(b) ? Date.parse(a) - Date.parse(b) : a < b ? -1 : a > b ? 1 : 0
  } else if (typeof a === 'number' && typeof b === 'number') {
    d = a - b
  } else {
    d = String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0
  }
  return asc ? d : -d
}

export function sortRows(rows: Row[], orders: { col: string; asc: boolean }[]): Row[] {
  return [...rows].sort((x, y) => {
    for (const o of orders) {
      const d = compare(x[o.col], y[o.col], o.asc)
      if (d !== 0) return d
    }
    return 0
  })
}

function project(tables: Tables, table: string, row: Row, fields: Field[]): Row {
  const out: Row = {}
  for (const f of fields) {
    if (f.children === null) {
      if (f.name === '*') Object.assign(out, row)
      else out[f.name] = row[f.name] ?? null
      continue
    }
    const rel = RELATIONS[table]?.[f.name]
    if (!rel) throw new Error(`demo: ${table} 에 ${f.name} 를 끼워 넣는 법을 모른다`)
    const hits = (tables[rel.table] ?? []).filter((r) => r[rel.foreign] === row[rel.local])
    const sorted = rel.order ? sortRows(hits, [{ col: rel.order, asc: true }]) : hits
    out[f.name] = rel.one
      ? (sorted[0] ? project(tables, rel.table, sorted[0], f.children) : null)
      : sorted.map((h) => project(tables, rel.table, h, f.children!))
  }
  return out
}

export type QueryResult = { data: unknown; error: { code: string; message: string; details?: string } | null; count: number | null }

export class Query implements PromiseLike<QueryResult> {
  private fields: Field[] = [{ name: '*', children: null }]
  private filters: ((r: Row) => boolean)[] = []
  private orders: { col: string; asc: boolean }[] = []
  private mode: 'many' | 'single' | 'maybe' = 'many'
  private head = false
  private counting = false
  private readonly tables: () => Tables
  private readonly table: string
  private readonly view: ((t: Tables) => Row[]) | undefined

  constructor(tables: () => Tables, table: string, view?: (t: Tables) => Row[]) {
    this.tables = tables
    this.table = table
    this.view = view
  }

  select(columns = '*', opts?: { count?: 'exact'; head?: boolean }): this {
    this.fields = parseSelect(columns)
    this.head = !!opts?.head
    this.counting = opts?.count === 'exact'
    return this
  }

  eq(col: string, value: unknown): this {
    this.filters.push((r) => r[col] === value)
    return this
  }

  in(col: string, values: readonly unknown[]): this {
    this.filters.push((r) => values.includes(r[col]))
    return this
  }

  order(col: string, opts?: { ascending?: boolean }): this {
    this.orders.push({ col, asc: opts?.ascending ?? true })
    return this
  }

  single(): this {
    this.mode = 'single'
    return this
  }

  maybeSingle(): this {
    this.mode = 'maybe'
    return this
  }

  run(): QueryResult {
    const tables = this.tables()
    const source = this.view ? this.view(tables) : tables[this.table]
    if (!source) throw new Error(`demo: ${this.table} 표가 없다`)
    const rows = sortRows(source.filter((r) => this.filters.every((f) => f(r))), this.orders)
    const count = this.counting ? rows.length : null
    if (this.head) return { data: null, error: null, count }
    const data = rows.map((r) => project(tables, this.table, r, this.fields))
    if (this.mode === 'many') return { data: structuredClone(data), error: null, count }
    if (data.length > 1 || (this.mode === 'single' && data.length === 0)) {
      return { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }, count }
    }
    return { data: data[0] ? structuredClone(data[0]) : null, error: null, count }
  }

  then<A = QueryResult, B = never>(
    onFulfilled?: ((v: QueryResult) => A | PromiseLike<A>) | null,
    onRejected?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve().then(() => this.run()).then(onFulfilled, onRejected)
  }
}
