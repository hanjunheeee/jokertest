// 효과음 음량 계산·구독과 재생 중인 소리에 음량 입히기
// sfxPlayer.js가 만들고 재생·임베드 소유 파일이 applyMix·silence를 씀
import { SFX_COMPLETION } from "../../constants/sfx.js"
import { guard, mixFrom } from "../../utils/sfx/event.js"

// 음량을 못 입힌 소리는 끄고 멈춤
export function silence(media) {
  guard(() => { media.muted = true }, undefined)
  guard(() => { media.volume = 0 }, undefined)
  guard(() => media.pause?.(), undefined)
}

// 음소거로 먼저 막고 음량을 넣은 뒤, 브라우저가 값을 그대로 받았는지 확인함
export function applyMix(media, mix) {
  try {
    media.muted = true
    media.volume = mix.gain
    media.muted = mix.muted
    if (media.volume !== mix.gain || media.muted !== mix.muted) throw new Error("mix rejected")
    return true
  } catch {
    silence(media)
    return false
  }
}

// 지금 음량은 ctx.currentMix에 두고 구독자에게 알림
export function createMix(ctx) {
  const { getSettings } = ctx

  // 설정을 못 읽으면 빈 설정으로 계산함
  function compute() {
    const settings = guard(() => getSettings?.(), null) ?? {}
    return mixFrom(settings)
  }

  // 바깥에서 못 바꾸게 사본을 줌
  function get() {
    return { ...ctx.currentMix }
  }

  // 함수 아닌 값은 안 받음, 끄는 함수 돌려줌
  function subscribe(listener) {
    if (typeof listener !== "function") return () => {}
    ctx.mixListeners.add(listener)
    return () => {
      ctx.mixListeners.delete(listener)
    }
  }

  // 설정이 바뀌면 재생 중인 소리·임베드 소리·구독자 순으로 새 음량을 알림
  function refresh() {
    if (ctx.disposed) return
    const next = compute()
    if (next.gain === ctx.currentMix.gain && next.muted === ctx.currentMix.muted) return
    ctx.currentMix = next
    const playing = ctx.active
    if (playing?.media && !applyMix(playing.media, ctx.currentMix)) {
      ctx.record("mix-apply-failed", playing.event, {stage:"mix"})
      playing.settle(SFX_COMPLETION.FAILED)
    }
    for (const claim of [...ctx.embeddedClaims]) claim.refresh(ctx.currentMix)
    for (const listener of [...ctx.mixListeners]) guard(() => listener(get()), undefined)
  }

  return { compute, get, subscribe, refresh }
}
