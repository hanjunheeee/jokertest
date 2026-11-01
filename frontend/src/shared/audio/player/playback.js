// 효과음 한 번 재생 (불러오기·검증·재생·끝 처리)과 재생 중인 소리 멈추기
// sfxPlayer.js가 만들고 재생 요청·범위 맞추기가 씀
// 불러오기와 재생 시작이 같은 타이머·정리 상태를 함께 써서 한 파일에 둠
import { SFX_COMPLETION, SFX_LOAD_TIMEOUT_MS, SFX_PLAYBACK_WATCHDOG_MS } from "../../constants/sfx.js"
import { verifyLoadedSfxAsset } from "../../utils/sfx/asset.js"
import { guard } from "../../utils/sfx/event.js"
import { applyMix } from "./mix.js"

export function createPlayback(ctx) {
  const { record, setTimer, clearTimer, loadAsset, createMedia } = ctx

  // 소리는 한 번에 하나만 냄
  function stopActive(reason) {
    if (ctx.active === null) return
    const current = ctx.active
    ctx.active = null
    current.settle(reason)
  }

  // 재생 하나를 시작하고 끝 결과(SFX_COMPLETION)를 약속으로 돌려줌
  function start(entry, event, capturedGeneration) {
    let settled = false
    let media = null
    let loadTimer = null
    let watchdog = null
    let detachListeners = null
    let releaseSrc = null
    let resolveCompletion
    const completion = new Promise((resolve) => {
      resolveCompletion = resolve
    })

    // 타이머·이벤트 구독·재생·불러온 자원을 전부 풂
    const cleanup = () => {
      if (loadTimer !== null) {
        guard(() => clearTimer(loadTimer), undefined)
        loadTimer = null
      }
      if (watchdog !== null) {
        guard(() => clearTimer(watchdog), undefined)
        watchdog = null
      }
      if (detachListeners !== null) {
        guard(detachListeners, undefined)
        detachListeners = null
      }
      if (media !== null) {
        guard(() => media.pause(), undefined)
        media = null
      }
      if (releaseSrc !== null) {
        const release = releaseSrc
        releaseSrc = null
        guard(release, undefined)
      }
    }

    const handle = {
      event,
      get media() {
        return media
      },
      // 처음 한 번만 끝냄
      settle(result) {
        if (settled) return
        settled = true
        cleanup()
        if (ctx.active === handle) ctx.active = null
        resolveCompletion(result)
      },
    }

    // 이미 끝났거나 플레이어가 버려졌거나 범위가 바뀐 재생
    const isStale = () => settled || ctx.disposed || capturedGeneration !== ctx.generation

    stopActive(SFX_COMPLETION.STOPPED)
    ctx.active = handle

    // 불러오기 시간 제한을 못 걸면 재생하지 않음
    loadTimer = guard(() => setTimer(() => handle.settle(SFX_COMPLETION.TIMED_OUT), SFX_LOAD_TIMEOUT_MS), null)
    if (loadTimer == null || settled) {
      record("timer-install-failed", event, {stage:"load"})
      handle.settle(SFX_COMPLETION.FAILED)
      return completion
    }

    const loadControl = {isCancelled:() => isStale() }
    let loading
    try {
      loading = Promise.resolve(loadAsset(entry, loadControl))
    } catch {
      handle.settle(SFX_COMPLETION.FAILED)
      return completion
    }

    loading.then(
      (loaded) => {
        // 늦게 온 결과는 자원만 풀고 버림
        const release = typeof loaded?.release === "function" ? loaded.release : null
        if (isStale()) {
          if (release !== null) guard(release, undefined)
          handle.settle(SFX_COMPLETION.STOPPED)
          return
        }
        releaseSrc = release
        const verified = verifyLoadedSfxAsset(entry, loaded)
        if (!verified.ok) {
          record(verified.reason, event, { stage: "verify" })
          handle.settle(SFX_COMPLETION.FAILED)
          return
        }
        if (loadTimer !== null) {
          guard(() => clearTimer(loadTimer), undefined)
          loadTimer = null
        }
        startMedia(verified.src)
      },
      () => {
        if (settled) return
        record("asset-load-failed", event, { stage: "load" })
        handle.settle(SFX_COMPLETION.FAILED)
      },
    )

    // 검증된 주소로 소리를 만들고 음량·끝 감지·감시 타이머를 건 뒤 재생함
    function startMedia(src) {
      try {
        media = createMedia(src)
      } catch {
        media = null
      }
      if (media === null || typeof media !== "object") {
        record("media-create-failed", event, { stage: "media" })
        handle.settle(SFX_COMPLETION.FAILED)
        return
      }

      if (!applyMix(media, ctx.currentMix)) {
        record("mix-apply-failed", event, {stage:"media"})
        handle.settle(SFX_COMPLETION.FAILED)
        return
      }

      // addEventListener가 없는 소리 객체는 onended·onerror로 받음
      const onEnded = () => handle.settle(SFX_COMPLETION.PLAYED)
      const onError = () => handle.settle(SFX_COMPLETION.FAILED)
      if (typeof media.addEventListener === "function") {
        const target = media
        guard(() => target.addEventListener("ended", onEnded), undefined)
        guard(() => target.addEventListener("error", onError), undefined)
        detachListeners = () => {
          guard(() => target.removeEventListener?.("ended", onEnded), undefined)
          guard(() => target.removeEventListener?.("error", onError), undefined)
        }
      } else {
        guard(() => {
          media.onended = onEnded
        }, undefined)
        guard(() => {
          media.onerror = onError
        }, undefined)
      }

      // 끝 이벤트가 안 와도 소리 길이 + 여유 뒤에 끝냄
      watchdog = guard(
        () => setTimer(() => handle.settle(SFX_COMPLETION.TIMED_OUT), entry.durationMs + SFX_PLAYBACK_WATCHDOG_MS),
        null,
      )

      if (watchdog == null || settled) {
        record("timer-install-failed", event, {stage:"play"})
        handle.settle(SFX_COMPLETION.FAILED)
        return
      }

      // play()가 던지거나 약속이 거절되면 실패로 끝냄
      let playResult
      try {
        playResult = media.play()
      } catch {
        record("play-threw", event, { stage: "play" })
        handle.settle(SFX_COMPLETION.FAILED)
        return
      }
      if (playResult !== null && typeof playResult === "object" && typeof playResult.then === "function") {
        playResult.then(
          () => {},
          () => {
            record("play-rejected", event, { stage: "play" })
            handle.settle(SFX_COMPLETION.FAILED)
          },
        )
      }
    }

    return completion
  }

  return { stopActive, start }
}
