// 체험판 전용: 가짜 데이터를 담아 두는 곳. 처음 값은 빌드 때 넣은 스냅숏이고, 바꾼 내용은 이 브라우저(localStorage)에만 남긴다.
// 스냅숏을 새로 만들면(createdAt 이 바뀌면) 예전에 바꾼 내용은 버리고 새 스냅숏에서 시작한다.
import type { MyContext } from '../shell/session'
import type { Tables } from './query'

export type DemoSnapshot = { createdAt: string; context: MyContext; tables: Tables }

export type DemoDb = {
  tables: Tables
  readonly context: MyContext
  save: () => void
  reset: () => void
}

export function createDemoDb(snapshot: DemoSnapshot, storageKey: string | null): DemoDb {
  const fresh = () => structuredClone(snapshot.tables)
  let tables = fresh()
  if (storageKey) {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as { createdAt?: string; tables?: Tables } | null
      if (saved?.createdAt === snapshot.createdAt && saved.tables) tables = saved.tables
    } catch { /* 저장소가 막힌 브라우저면 처음 값으로 */ }
  }
  const db: DemoDb = {
    tables,
    context: snapshot.context,
    save() {
      if (!storageKey) return
      try {
        localStorage.setItem(storageKey, JSON.stringify({ createdAt: snapshot.createdAt, tables: db.tables }))
      } catch { /* 저장소가 막힌 브라우저면 이번 창에서만 남는다 */ }
    },
    reset() {
      db.tables = fresh()
      if (!storageKey) return
      try {
        localStorage.removeItem(storageKey)
      } catch { /* 위와 같음 */ }
    },
  }
  return db
}
