// 지금 앱에 붙은 효과음 플레이어 하나를 들고, 바깥 요청을 그 플레이어로 넘김
// useSfxRuntime 훅이 플레이어를 넣고 빼며, 화면·스토어·시험이 useSfxRuntime.js 경로로 씀
import { SFX_SUPPRESSED_REASON } from "../constants/sfx.js"

let activePlayer = null

// 플레이어가 없거나 던지면 모두 이 '막힘' 응답을 돌려줌
export const NO_RUNTIME = Object.freeze({
  status: "suppressed",
  reason: SFX_SUPPRESSED_REASON.NO_RUNTIME,
  completion: Promise.resolve("stopped"),
})

export function setActivePlayer(player) {
  activePlayer = player
}

// 내가 넣은 플레이어일 때만 비움 (새 훅이 이미 바꿔 넣었으면 그대로 둠)
export function clearActivePlayer(player) {
  if (activePlayer === player) activePlayer = null
}

export function dispatchSfxEvent(event) {
  if (activePlayer === null) return NO_RUNTIME
  try {
    return activePlayer.dispatch(event)
  } catch {
    return NO_RUNTIME
  }
}

export function claimSfxAudio(event, options) {
  if (activePlayer === null) {
    return { status: "suppressed", reason: SFX_SUPPRESSED_REASON.NO_RUNTIME,attach: () => {
},release: () => {
} }
  }
  try {
    return activePlayer.claimAudio(event, options)
  } catch {
    return { status: "suppressed", reason: SFX_SUPPRESSED_REASON.NO_RUNTIME,attach: () => {
},release: () => {
} }
  }
}

// 플레이어가 없으면 소리 없음으로 봄
export function getSfxMix() {
  if (activePlayer === null) return { gain: 0, muted: true }
  try {
    return activePlayer.getMix()
  } catch {
    return { gain: 0, muted: true }
  }
}

export function subscribeSfxMix(listener) {
  if (activePlayer === null) return () => {}
  try {
    return activePlayer.subscribeMix(listener)
  } catch {
    return () => {}
  }
}

export function getSfxSilenceLog() {
  if (activePlayer === null) return []
  try {
    return activePlayer.getSilenceLog()
  } catch {
    return []
  }
}

export function __setSfxPlayerForTests(player) {
  activePlayer = player ?? null
}
