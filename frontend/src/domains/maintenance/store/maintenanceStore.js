// 점검 큰 안내 상태: 받은 점검 신호·서버 시계 차이·큰 안내 열림·다시 띄울 단계·강제 종료 안내
// 점검 안내 훅(useMaintenanceNotice)이 씀, 신호 받기는 socket/maintenanceEvents.js
import { create } from "zustand"
import { remainingMs, stageOf } from "../utils/maintenanceText.js"

const STATES = new Set(["scheduled", "active", "cleared"])

const EMPTY = Object.freeze({
  notice: null, // { state, message, startsAt, endsAt } (시각은 ms)
  offsetMs: 0, // 서버 시각 - 기기 시각
  open: false, // 큰 안내 열림
  stage: 0, // 마지막으로 크게 띄운 단계 (0 처음, 1 10분 전, 2 1분 전)
  forcedEnd: null, // 강제 종료 안내: 'game' | 'room' | null
})

const toMs = (value) => (typeof value === "string" ? Date.parse(value) : NaN)

// 같은 안내를 다시 받았는지 (다시 접속하면 같은 안내가 또 옴 → 닫은 걸 다시 안 띄움)
const isSameNotice = (prev, next) =>
  prev !== null && prev.state === next.state && prev.startsAt === next.startsAt && prev.message === next.message

export const useMaintenanceStore = create((set, get) => ({
  ...EMPTY,

  // 서버 신호 반영: cleared면 안내·띠 지움(강제 종료 안내는 남김), 새 안내면 크게 띄움
  receive(payload, deviceNow = Date.now()) {
    if (!payload || !STATES.has(payload.state)) return
    if (payload.state === "cleared") {
      set({ notice: null, open: false, stage: 0 })
      return
    }
    const serverNow = toMs(payload.serverNow)
    const offsetMs = Number.isFinite(serverNow) ? serverNow - deviceNow : 0
    const notice = {
      state: payload.state,
      message: typeof payload.message === "string" ? payload.message : "",
      startsAt: toMs(payload.startsAt),
      endsAt: toMs(payload.endsAt),
    }
    const stage = stageOf(remainingMs(notice.startsAt, offsetMs, deviceNow))
    const prev = get()
    if (isSameNotice(prev.notice, notice)) {
      set({ notice, offsetMs })
      return
    }
    set({ notice, offsetMs, open: true, stage })
  },

  // 1초마다: 예약 중이고 10분·1분 선을 새로 넘었으면 다시 크게
  tick(deviceNow = Date.now()) {
    const { notice, offsetMs, stage } = get()
    if (notice?.state !== "scheduled") return
    const next = stageOf(remainingMs(notice.startsAt, offsetMs, deviceNow))
    if (next > stage) set({ open: true, stage: next })
  },

  // 큰 안내 닫기 (띠로 남음) / 띠 눌러 다시 열기
  close: () => set({ open: false }),
  reopen: () => set((s) => (s.notice ? { open: true } : {})),

  // 점검으로 판이 끝남·대기방이 닫힘
  forceEnd: (kind) => set({ forcedEnd: kind === "room" ? "room" : "game" }),
  // 강제 종료 안내 확인: 큰 안내도 같이 닫음 (두 번 안 누르게)
  confirmForcedEnd: () => set({ forcedEnd: null, open: false }),

  reset: () => set({ ...EMPTY }),
}))
