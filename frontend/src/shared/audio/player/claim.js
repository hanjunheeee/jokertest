// 영상에 들어 있는 소리의 소유 받기 (같은 범위·중복 검사 뒤 영상에 음량을 입힘)
// sfxPlayer.js가 만들어 claimAudio로 내보냄
import { applyMix, silence } from "./mix.js"

// admit·syncScope는 범위 파일(scope.js) 것을 받음
export function createClaim(ctx, admit, syncScope) {
  const { record } = ctx

  // 소유를 받으면 attach로 영상을 붙이고 release로 놓음
  return function claimAudio(rawEvent, options) {
    const mode = options?.mode ?? "embedded"
    const admitted = admit(mode === "embedded" ? { ...rawEvent, audioMode: "embedded" } : rawEvent)
    if (!admitted.ok) {
      record(admitted.reason, admitted.event ?? rawEvent, { stage: "claim" })
      return { status: "suppressed", reason: admitted.reason,attach:() => false,release: () => {
} }
    }

    let released = false
    let attached = null
    // 설정이 바뀌면 플레이어가 refresh로 새 음량을 넣어 줌, 못 넣으면 놓음
    const owner = {
      refresh(mix) {
        if (attached && !applyMix(attached, mix)) {
          record("mix-apply-failed", admitted.event, {stage:"embedded"})
          release()
        }
      },
      release,
    }
    function release() {
      if (released) return
      released = true
      ctx.embeddedClaims.delete(owner)
      if (attached !== null) {
        silence(attached)
        attached = null
      }
    }
    ctx.embeddedClaims.add(owner)
    return {
      status: "claimed",
      reason: null,
      // 범위가 바뀐 뒤 붙이는 영상은 거절함, 같은 영상을 다시 붙이면 true
      attach(media) {
        syncScope()
        if (ctx.disposed || released || admitted.generation !== ctx.generation || media === null || typeof media !== "object") return false
        if (attached !== null) return attached === media
        if (!applyMix(media, ctx.currentMix)) {
          record("mix-apply-failed", admitted.event, {stage:"embedded"})
          release()
          return false
        }
        attached = media
        return true
      },
      release,
    }
  }
}
