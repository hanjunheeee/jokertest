// 효과음 재생 요청 받기 (범위·목록·설정·쿨다운 검사 뒤 재생 시작)
// sfxPlayer.js가 만들어 dispatch로 내보냄
import { SFX_SCOPE, SFX_SUPPRESSED_REASON, SFX_UI_COOLDOWN_MS } from "../../constants/sfx.js"
import { checkSfxAssetAllowed } from "../../utils/sfx/asset.js"
import { guard, suppressed } from "../../utils/sfx/event.js"

export function createDispatch(ctx, admit, startPlayback) {
  const { record, getSettings, now } = ctx

  // 막히면 이유를 남기고 suppressed, 통과하면 accepted와 끝 약속을 돌려줌
  return function dispatch(rawEvent) {
    const admitted = admit(rawEvent)
    if (!admitted.ok) {
      record(admitted.reason, admitted.event ?? rawEvent, { stage: "admit" })
      return suppressed(admitted.reason)
    }
    const { entry, event, generation: capturedGeneration } = admitted

    // 검수 안 된 소리는 내지 않음
    const allowed = checkSfxAssetAllowed(entry)
    if (!allowed.allowed) {
      record(allowed.reason, event, { stage: "manifest", note: entry.silenceReason ?? null })
      return suppressed(allowed.reason)
    }

    // 영상에 소리가 들어 있는 경우는 영상 쪽(claimAudio)이 맡음
    if (event.audioMode === "embedded" || entry.audioMode === "embedded") {
      record(SFX_SUPPRESSED_REASON.EMBEDDED_OWNED, event, { stage: "ownership" })
      return suppressed(SFX_SUPPRESSED_REASON.EMBEDDED_OWNED)
    }

    // 알림 설정에서 끈 종류는 내지 않음
    if (typeof entry.notificationKey === "string") {
      const settings = guard(() => getSettings?.(), null) ?? {}
      const notifications = settings.notifications
      const enabled = notifications?.[entry.notificationKey]
      if (enabled === false) {
        record(SFX_SUPPRESSED_REASON.NOTIFICATION_DISABLED, event, { stage: "settings" })
        return suppressed(SFX_SUPPRESSED_REASON.NOTIFICATION_DISABLED)
      }
    }

    if (ctx.currentMix.muted || ctx.currentMix.gain === 0) {
      record(SFX_SUPPRESSED_REASON.MUTED, event, { stage: "settings" })
      return suppressed(SFX_SUPPRESSED_REASON.MUTED)
    }

    // 화면 소리는 연달아 누를 때 겹치지 않게 쿨다운을 둠
    if (entry.scope === SFX_SCOPE.UI) {
      const at = guard(now, 0)
      if (at - ctx.lastUiPlayAt < SFX_UI_COOLDOWN_MS) {
        record(SFX_SUPPRESSED_REASON.COOLDOWN, event, { stage: "cooldown" })
        return suppressed(SFX_SUPPRESSED_REASON.COOLDOWN)
      }
      ctx.lastUiPlayAt = at
    }

    const completion = startPlayback(entry, event, capturedGeneration)
    return { status: "accepted", reason: null, completion }
  }
}
