// 점검 큰 안내 훅: 소켓 점검 신호 붙이기·1초 시계·화면에 보일 모양(큰 안내/띠/강제 종료/없음) 만들기
// 데스크톱·모바일 MaintenanceNotice가 씀, 로비로 이동은 받은 navigate로
import { useEffect, useState } from "react"
import { useMaintenanceStore } from "../store/maintenanceStore.js"
import { onMaintenanceSignals } from "../socket/maintenanceEvents.js"
import { formatClock, formatRemaining, remainingMs } from "../utils/maintenanceText.js"

const LOBBY_PATH = "/lobby"

// 신호 붙이기: 소켓이 없으면(로그아웃) 안내 지움
function useSignals(socket, setNow) {
  useEffect(() => {
    const store = useMaintenanceStore.getState()
    if (!socket) {
      store.reset()
      return undefined
    }
    return onMaintenanceSignals(socket, {
      notice: (payload) => {
        const now = Date.now()
        setNow(now)
        useMaintenanceStore.getState().receive(payload, now)
      },
      gameEnded: () => useMaintenanceStore.getState().forceEnd("game"),
      roomClosed: () => useMaintenanceStore.getState().forceEnd("room"),
    })
  }, [socket, setNow])
}

// 안내가 있을 때만 1초마다 다시 그리고 10분·1분 선 확인
function useSecondClock(active, setNow) {
  useEffect(() => {
    if (!active) return undefined
    const id = setInterval(() => {
      const now = Date.now()
      setNow(now)
      useMaintenanceStore.getState().tick(now)
    }, 1000)
    return () => clearInterval(id)
  }, [active, setNow])
}

// 화면 모양 고르기: 강제 종료 안내 > 큰 안내 > 띠
const pickMode = ({ forcedEnd, notice, open }) => {
  if (forcedEnd) return "forced"
  if (!notice) return "none"
  return open ? "big" : "band"
}

export function useMaintenanceNotice(socket, { navigate }) {
  const [now, setNow] = useState(() => Date.now())
  const notice = useMaintenanceStore((s) => s.notice)
  const offsetMs = useMaintenanceStore((s) => s.offsetMs)
  const open = useMaintenanceStore((s) => s.open)
  const stage = useMaintenanceStore((s) => s.stage)
  const forcedEnd = useMaintenanceStore((s) => s.forcedEnd)

  useSignals(socket, setNow)
  useSecondClock(notice !== null, setNow)

  const mode = pickMode({ forcedEnd, notice, open })
  return {
    mode,
    // 다시 띄울 때마다 바뀌는 값 (초점 다시 주기·화면 읽기 다시 알림용)
    openKey: mode === "big" ? `big-${notice.state}-${stage}` : mode,
    state: notice?.state ?? null,
    forcedKind: forcedEnd,
    message: notice?.message ?? "",
    remainingText: notice ? formatRemaining(remainingMs(notice.startsAt, offsetMs, now)) : "",
    startsAtText: notice ? formatClock(notice.startsAt) : null,
    endsAtText: notice ? formatClock(notice.endsAt) : null,
    close: () => useMaintenanceStore.getState().close(),
    reopen: () => useMaintenanceStore.getState().reopen(),
    confirm: () => {
      useMaintenanceStore.getState().confirmForcedEnd()
      navigate(LOBBY_PATH, { replace: true })
    },
  }
}
