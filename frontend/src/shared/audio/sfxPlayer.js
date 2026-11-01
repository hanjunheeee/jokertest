// 효과음 플레이어 입구 (상태를 만들고 player/ 아래 범위·음량·재생·요청 파일을 이어 붙임)
// useSfxRuntime 훅·효과음 시험이 이 경로로 씀
import { SFX_COMPLETION } from "../constants/sfx.js"
import { guard } from "../utils/sfx/event.js"
import { createState } from "./player/state.js"
import { createMix } from "./player/mix.js"
import { createScope } from "./player/scope.js"
import { createPlayback } from "./player/playback.js"
import { createDispatch } from "./player/dispatch.js"
import { createClaim } from "./player/claim.js"

export { SFX_COMPLETION } from "../constants/sfx.js"

// io로 받은 설정·범위·불러오기 함수로 플레이어 하나를 만듦
export function createSfxPlayer(io) {
  const ctx = createState(io)
  const playback = createPlayback(ctx)
  const scope = createScope(ctx, playback.stopActive)
  const mix = createMix(ctx)
  const dispatch = createDispatch(ctx, scope.admit, playback.start)
  const claimAudio = createClaim(ctx, scope.admit, scope.sync)

  // 범위를 먼저 읽고 음량을 계산한 뒤 설정 구독을 검
  ctx.lastScope = scope.read()
  ctx.currentMix = mix.compute()

  const { subscribeSettings } = ctx
  const unsubscribeSettings =
    typeof subscribeSettings === "function" ? guard(() => subscribeSettings(mix.refresh), null) : null

  // 버린 뒤에는 어떤 요청도 받지 않음
  function dispose() {
    if (ctx.disposed) return
    ctx.disposed = true
    playback.stopActive(SFX_COMPLETION.STOPPED)
    ctx.handled.clear()
    ctx.mixListeners.clear()
    for (const claim of [...ctx.embeddedClaims]) claim.release()
    if (typeof unsubscribeSettings === "function") guard(unsubscribeSettings, undefined)
  }

  return {
    dispatch,
    getMix: mix.get,
    subscribeMix: mix.subscribe,
    claimAudio,
    syncScope: scope.sync,
    refreshMix: mix.refresh,
    dispose,
    getSilenceLog: () => [...ctx.silenceLog],
  }
}
