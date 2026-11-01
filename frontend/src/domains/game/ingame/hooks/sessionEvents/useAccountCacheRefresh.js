// 계정 캐시 새로 받기 훅: 다시 연결·창 돌아옴·화면 보임 때마다
// 판 진행 이벤트 훅(useGameSessionSocketEvents)이 부름
import { useEffect } from "react"
import { ACCOUNT_CACHE_SCOPES } from "../../../../user/utils/accountCacheRefresh.js"
import { onConnect } from "../../socket/connection.js"
import { refreshCaches } from "./scope.js"

export function useAccountCacheRefresh(socket) {
  useEffect(() => {
    const refresh = () => refreshCaches(ACCOUNT_CACHE_SCOPES)

    // 화면이 다시 보일 때만
    const handleVisibility = () => {
      if (typeof document === "undefined") return
      if (document.visibilityState !== "visible") return
      refresh()
    }

    const offConnect = socket ? onConnect(socket, refresh) : null
    if (typeof window !== "undefined") window.addEventListener("focus", refresh)
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", handleVisibility)

    return () => {
      if (offConnect) offConnect()
      if (typeof window !== "undefined") window.removeEventListener("focus", refresh)
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [socket])
}
