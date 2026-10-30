import { createContext, useContext, useEffect, useState, type DependencyList, type ReactNode } from 'react'

// Ctrl+K 명령 팔레트에 화면이 자기 명령(기간 바꾸기, 탭 열기 등)을 올려 두는 자리.
// 화면이 바뀌면 그 화면의 명령도 내려간다.
export type Command = { id: string; label: string; hint?: string; keywords?: string; run: () => void }

type Ctx = { page: Command[]; setPage: (c: Command[]) => void }
const CommandsContext = createContext<Ctx>({ page: [], setPage: () => {} })

export function CommandsProvider({ children }: { children: ReactNode }) {
  const [page, setPage] = useState<Command[]>([])
  return <CommandsContext.Provider value={{ page, setPage }}>{children}</CommandsContext.Provider>
}

export const usePageCommandList = () => useContext(CommandsContext).page

// deps 가 바뀔 때마다 명령을 새로 올린다(명령 안의 함수가 지금 상태를 보게)
export function usePageCommands(make: () => Command[], deps: DependencyList) {
  const { setPage } = useContext(CommandsContext)
  useEffect(() => {
    setPage(make())
    return () => setPage([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
