/**
 * F-16 공통 효과음 재생기.
 *
 * 이 모듈은 DOM·store·소켓을 직접 알지 않는다 — 필요한 것(설정 접근자, 범위 접근자,
 * 자산 로더, 매체 factory, 시계·타이머)을 전부 주입받는다. 그래서 계약 시험이 실제
 * 재생기 코드를 그대로 돌릴 수 있다(핸들러 복제 없이).
 *
 * 계약 요약
 *  - dispatch(event) → { status, reason, completion } 을 **동기**로 돌려준다.
 *    status=accepted|suppressed. accepted는 "청음 성공"이 아니라 "재생 시도를 시작했다"는
 *    뜻이다. completion은 played|failed|timed-out|stopped 중 하나로 유한 시간 안에 정착한다.
 *    호출자는 completion을 기다리지 않는다(AC-06).
 *  - 입력 오류·복원(origin=restore)·계정/게임 불일치·알림 off·mute·미검토 자산·중복은
 *    **매체를 만들기 전에** 거부한다.
 *  - getMix()/subscribeMix()/claimAudio()는 F-27 영상 내장음이 같은 볼륨·mute·중복 키를
 *    쓰게 하기 위한 공통 API다(AC-03/AC-05).
 */
import {
  SFX_LOAD_TIMEOUT_MS,
  SFX_PLAYBACK_WATCHDOG_MS,
  SFX_SCOPE,
  SFX_SUPPRESSED_REASON,
  SFX_UI_COOLDOWN_MS,
  checkSfxAssetAllowed,
  lookupSfxAsset,
  verifyLoadedSfxAsset,
} from "./sfxManifest.js"

/** completion이 가질 수 있는 값. 전부 "정착"이며 그 뒤로 다시 바뀌지 않는다. */
export const SFX_COMPLETION = Object.freeze({
  PLAYED: "played",
  FAILED: "failed",
  TIMED_OUT: "timed-out",
  STOPPED: "stopped",
})

const SETTLED_STOPPED = Promise.resolve(SFX_COMPLETION.STOPPED)

/** 억제 응답. completion은 "이미 정착한 stopped"다(계획 메모의 공통 신규 API 절). */
function suppressed(reason) {
  return { status: "suppressed", reason, completion: SETTLED_STOPPED }
}

/** 어떤 주입 콜백이 던져도 재생기 바깥으로 나가지 않게 감싼다(AC-06 격리). */
function guard(fn, fallback) {
  try {
    return fn()
  } catch {
    return fallback
  }
}

function clampPercent(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

/**
 * dispatch/claimAudio 입력 형태 검증. 신뢰하지 않는 값이 그대로 키·로그로 흘러가지 않게
 * 문자열 타입과 비어 있지 않음을 여기서 확정한다.
 */
function validateEvent(event) {
  if (event === null || typeof event !== "object" || Array.isArray(event)) return null
  const { kind, eventId } = event
  if (typeof kind !== "string" || kind.trim().length === 0) return null
  if (typeof eventId !== "string" || eventId.trim().length === 0) return null

  const origin = event.origin === "restore" ? "restore" : event.origin === "live" ? "live" : null
  if (origin === null) return null

  const audioMode =
    event.audioMode === "embedded" ? "embedded" : event.audioMode === undefined || event.audioMode === "separate" ? "separate" : null
  if (audioMode === null) return null

  const optionalId = (value) => (typeof value === "string" && value.trim().length > 0 ? value : null)

  return {
    kind,
    eventId,
    origin,
    audioMode,
    accountId: optionalId(event.accountId),
    gameId: optionalId(event.gameId),
    roomId: optionalId(event.roomId),
  }
}

/**
 * createSfxPlayer.
 *
 * @param {object} io
 * @param {object} io.manifest            사건 kind → 자산 항목(sfxManifest 형태)
 * @param {() => object} io.getSettings   { masterVolume, sfxVolume, sfxMuted, notifications }
 * @param {(fn:Function) => Function} [io.subscribeSettings] 변경 통지(해제 함수를 돌려준다)
 * @param {() => object} io.getScope      { accountId, gameId, roomId } — 현재 인증 계정/게임/방
 * @param {(entry:object, ctl:object) => Promise<{sha256:string, src:string}>} io.loadAsset
 * @param {(src:string) => object} io.createMedia
 * @param {() => number} [io.now]
 * @param {(fn:Function, ms:number) => any} [io.setTimer]
 * @param {(handle:any) => void} [io.clearTimer]
 * @param {(record:object) => void} [io.onSilence] 무음 사유 기록(선택)
 */
export function createSfxPlayer(io) {
  const {
    manifest,
    getSettings,
    subscribeSettings,
    getScope,
    loadAsset,
    createMedia,
    now = () => Date.now(),
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (handle) => clearTimeout(handle),
    onSilence,
  } = io ?? {}

  let disposed = false
  // 범위(계정·게임·방)가 바뀔 때마다 오른다. 늦게 도착한 로드·재생 콜백은 자신이 캡처한
  // 세대와 비교해 스스로 무효가 된다.
  let generation = 0
  /** 처리 표식. 활성 범위 동안 유지하고 소켓 재연결·리렌더로 지우지 않는다(AC-04). */
  const handled = new Map()
  /** 현재 재생 중인 별도 SFX는 항상 최대 하나다. */
  let active = null
  let lastUiPlayAt = Number.NEGATIVE_INFINITY

  const mixListeners = new Set()
  /** 내장음(embedded) claim이 붙여 둔 매체들 — mix 변경을 함께 받는다. */
  const embeddedMedia = new Set()

  const silenceLog = []
  const SILENCE_LOG_LIMIT = 200

  let lastScope = readScope()
  let currentMix = computeMix()

  // --- 범위 -----------------------------------------------------------------

  function readScope() {
    const scope = guard(() => getScope?.(), null)
    if (scope === null || typeof scope !== "object") return { accountId: null, gameId: null, roomId: null }
    const pick = (value) => (typeof value === "string" && value.trim().length > 0 ? value : null)
    return { accountId: pick(scope.accountId), gameId: pick(scope.gameId), roomId: pick(scope.roomId) }
  }

  function record(reason, event, extra) {
    const entry = { reason, kind: event?.kind ?? null, eventId: event?.eventId ?? null, at: guard(now, 0), ...extra }
    silenceLog.push(entry)
    if (silenceLog.length > SILENCE_LOG_LIMIT) silenceLog.shift()
    // 기록 구독자가 던져도 재생 판단에 영향을 주지 않는다.
    if (typeof onSilence === "function") guard(() => onSilence(entry), undefined)
  }

  /**
   * 범위 변경을 반영한다. 계정이 바뀌면 모든 처리 표식을 버리고, 게임/방만 바뀌면 그
   * 범위의 표식만 버린다 — 종료된 범위의 늦은 사건은 이후 범위 검사에서 거부된다.
   */
  function syncScope() {
    if (disposed) return
    const next = readScope()
    const accountChanged = next.accountId !== lastScope.accountId
    const gameChanged = next.gameId !== lastScope.gameId
    const roomChanged = next.roomId !== lastScope.roomId
    if (!accountChanged && !gameChanged && !roomChanged) return

    const previous = lastScope
    lastScope = next
    generation += 1

    if (accountChanged) {
      handled.clear()
    } else {
      if (gameChanged && previous.gameId !== null) dropKeysWithSegment(`game:${previous.gameId}`)
      if (roomChanged && previous.roomId !== null) dropKeysWithSegment(`room:${previous.roomId}`)
    }

    // 진행 중이던 로드·재생을 즉시 중단한다. 늦은 resolve는 위 generation 증가로 이미 무효다.
    stopActive(SFX_COMPLETION.STOPPED)
  }

  function dropKeysWithSegment(segment) {
    for (const key of [...handled.keys()]) {
      if (key.includes(`|${segment}|`)) handled.delete(key)
    }
  }

  // --- 볼륨/mute 공통 API ----------------------------------------------------

  function computeMix() {
    const settings = guard(() => getSettings?.(), null) ?? {}
    const master = clampPercent(settings.masterVolume) / 100
    const sfx = clampPercent(settings.sfxVolume) / 100
    const muted = settings.sfxMuted === true
    const gain = master * sfx
    return { gain: muted ? 0 : gain, muted }
  }

  /** { gain, muted } — sfxMuted면 유효 gain은 0이다. F-27 영상 내장음도 이 값을 쓴다. */
  function getMix() {
    return { ...currentMix }
  }

  function subscribeMix(listener) {
    if (typeof listener !== "function") return () => {}
    mixListeners.add(listener)
    return () => {
      mixListeners.delete(listener)
    }
  }

  function applyMixToMedia(media, mix) {
    // 속성 대입 각각이 던질 수 있다(잠긴 매체·플랫폼 제약) — 서로를 막지 않게 따로 감싼다.
    guard(() => {
      media.volume = mix.gain
    }, undefined)
    guard(() => {
      media.muted = mix.muted
    }, undefined)
  }

  function refreshMix() {
    if (disposed) return
    const next = computeMix()
    if (next.gain === currentMix.gain && next.muted === currentMix.muted) return
    currentMix = next
    if (active?.media) applyMixToMedia(active.media, currentMix)
    for (const media of embeddedMedia) applyMixToMedia(media, currentMix)
    for (const listener of [...mixListeners]) guard(() => listener(getMix()), undefined)
  }

  const unsubscribeSettings =
    typeof subscribeSettings === "function" ? guard(() => subscribeSettings(refreshMix), null) : null

  // --- 검증 ------------------------------------------------------------------

  /** 범위 검사 — 서버 사건의 계정은 현재 인증 계정과 반드시 일치해야 한다. */
  function checkScope(entry, event) {
    const scope = lastScope
    if (entry.scope === SFX_SCOPE.UI) {
      // 익명 UI는 별도 런타임 범위(anon)를 쓴다 — 계정이 없다고 거부하지 않는다.
      return { ok: true, prefix: `ui|${scope.accountId ?? "anon"}` }
    }

    // 서버 사건은 익명 범위에서 받아들이지 않는다.
    if (scope.accountId === null) return { ok: false, reason: SFX_SUPPRESSED_REASON.ANONYMOUS_SCOPE }
    if (event.accountId === null) return { ok: false, reason: SFX_SUPPRESSED_REASON.MISSING_SCOPE }
    if (event.accountId !== scope.accountId) return { ok: false, reason: SFX_SUPPRESSED_REASON.ACCOUNT_MISMATCH }

    if (entry.scope === SFX_SCOPE.GAME) {
      if (event.gameId === null) return { ok: false, reason: SFX_SUPPRESSED_REASON.MISSING_SCOPE }
      if (scope.gameId === null || event.gameId !== scope.gameId) {
        return { ok: false, reason: SFX_SUPPRESSED_REASON.GAME_MISMATCH }
      }
      return { ok: true, prefix: `acct:${scope.accountId}|game:${scope.gameId}` }
    }

    if (entry.scope === SFX_SCOPE.ROOM) {
      if (event.roomId === null) return { ok: false, reason: SFX_SUPPRESSED_REASON.MISSING_SCOPE }
      if (scope.roomId === null || event.roomId !== scope.roomId) {
        return { ok: false, reason: SFX_SUPPRESSED_REASON.ROOM_MISMATCH }
      }
      return { ok: true, prefix: `acct:${scope.accountId}|room:${scope.roomId}` }
    }

    // 계정 전역 사건(친구·업적)
    return { ok: true, prefix: `acct:${scope.accountId}` }
  }

  function buildKey(prefix, event) {
    return `${prefix}|${event.kind}|${event.eventId}|`
  }

  /**
   * 매체를 만들기 전까지의 공통 관문. dispatch와 claimAudio가 **같은** 중복 키를 선점하도록
   * 여기 한 곳에 모은다(AC-05의 이중 claim 계약).
   *
   * @returns {{ ok:true, entry:object, event:object, key:string, generation:number } | { ok:false, reason:string }}
   */
  function admit(rawEvent) {
    if (disposed) return { ok: false, reason: SFX_SUPPRESSED_REASON.DISPOSED }

    const event = validateEvent(rawEvent)
    if (event === null) return { ok: false, reason: SFX_SUPPRESSED_REASON.INVALID_EVENT }

    const entry = lookupSfxAsset(manifest, event.kind)
    if (entry === null) return { ok: false, reason: SFX_SUPPRESSED_REASON.UNKNOWN_KIND, event }

    // 재접속·스냅샷 복원은 새 사건이 아니다(A-05). 표식도 남기지 않는다 — 나중에 같은
    // 사건이 live로 오면 그때가 최초다.
    if (event.origin !== "live") return { ok: false, reason: SFX_SUPPRESSED_REASON.RESTORE_ORIGIN, event }

    // 범위가 바뀐 직후일 수 있으므로 검사 직전에 한 번 맞춘다.
    syncScope()
    const scopeCheck = checkScope(entry, event)
    if (!scopeCheck.ok) return { ok: false, reason: scopeCheck.reason, event }

    const key = buildKey(scopeCheck.prefix, event)
    if (handled.has(key)) return { ok: false, reason: SFX_SUPPRESSED_REASON.DUPLICATE, event }

    // 유효한 사건이다 — 비동기 로드보다 **먼저** 표식을 선점한다. 이후 어떤 이유로 억제되든
    // (mute·알림 off·미검토 자산) 이 사건은 나중에 설정을 바꿔도 다시 재생되지 않는다(AC-04).
    handled.set(key, true)
    return { ok: true, entry, event, key, generation }
  }

  // --- 재생 ------------------------------------------------------------------

  function stopActive(reason) {
    if (active === null) return
    const current = active
    active = null
    current.settle(reason)
  }

  function startPlayback(entry, event, capturedGeneration) {
    let settled = false
    let media = null
    let loadTimer = null
    let watchdog = null
    let detachListeners = null
    // 로더가 검증한 바이트로 만든 임시 소스(blob URL 등)의 해제 함수. 어떤 정착 경로로 끝나도
    // cleanup이 반드시 호출한다 — 해제하지 않으면 문서 수명 동안 URL이 남는다.
    let releaseSrc = null
    let resolveCompletion
    const completion = new Promise((resolve) => {
      resolveCompletion = resolve
    })

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
      // 매체를 먼저 멈춘 뒤에 소스를 해제한다.
      if (releaseSrc !== null) {
        const release = releaseSrc
        releaseSrc = null
        guard(release, undefined)
      }
    }

    const handle = {
      get media() {
        return media
      },
      settle(result) {
        if (settled) return
        settled = true
        cleanup()
        if (active === handle) active = null
        resolveCompletion(result)
      },
    }

    const isStale = () => settled || disposed || capturedGeneration !== generation

    // 이전 활성 SFX를 멈추고 이 사건이 단일 활성 자리를 가져간다. 억제된 소리는 큐에 쌓지 않는다.
    stopActive(SFX_COMPLETION.STOPPED)
    active = handle

    // 로드가 영원히 정착하지 않아도 completion은 유한 시간 안에 끝난다.
    loadTimer = guard(() => setTimer(() => handle.settle(SFX_COMPLETION.TIMED_OUT), SFX_LOAD_TIMEOUT_MS), null)

    const loadControl = { isCancelled: () => isStale() }
    let loading
    try {
      loading = Promise.resolve(loadAsset(entry, loadControl))
    } catch {
      handle.settle(SFX_COMPLETION.FAILED)
      return completion
    }

    loading.then(
      (loaded) => {
        // 로더가 임시 소스를 만들었다면, 이 사건이 이미 무효가 됐더라도 반드시 해제한다.
        const release = typeof loaded?.release === "function" ? loaded.release : null
        if (isStale()) {
          if (release !== null) guard(release, undefined)
          handle.settle(SFX_COMPLETION.STOPPED)
          return
        }
        // 이 시점부터는 cleanup이 해제를 책임진다(아래 실패 경로들도 settle→cleanup을 거친다).
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

      applyMixToMedia(media, currentMix)

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

      // ended가 아예 오지 않아도(잠긴 탭·매체 버그) 유한 시간에 정리한다.
      watchdog = guard(
        () => setTimer(() => handle.settle(SFX_COMPLETION.TIMED_OUT), entry.durationMs + SFX_PLAYBACK_WATCHDOG_MS),
        null,
      )

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
            // 자동재생 거절 포함. 다음 클릭으로 재시도하지 않는다 — 이 사건은 여기서 끝난다.
            record("play-rejected", event, { stage: "play" })
            handle.settle(SFX_COMPLETION.FAILED)
          },
        )
      }
    }

    return completion
  }

  // --- 공개 API ---------------------------------------------------------------

  /**
   * 사건 하나를 재생한다. 동기 반환이며 호출자는 completion을 기다리지 않는다.
   * @param {{kind:string, eventId:string, accountId?:string, gameId?:string, roomId?:string,
   *          origin:'live'|'restore', audioMode?:'separate'|'embedded'}} rawEvent
   */
  function dispatch(rawEvent) {
    const admitted = admit(rawEvent)
    if (!admitted.ok) {
      record(admitted.reason, admitted.event ?? rawEvent, { stage: "admit" })
      return suppressed(admitted.reason)
    }
    const { entry, event, generation: capturedGeneration } = admitted

    // 내장음이 소유한 사건에는 별도 음을 내지 않는다(AC-05). 표식은 이미 선점했으므로
    // 뒤늦은 separate dispatch도 중복으로 막힌다.
    if (event.audioMode === "embedded" || entry.audioMode === "embedded") {
      record(SFX_SUPPRESSED_REASON.EMBEDDED_OWNED, event, { stage: "ownership" })
      return suppressed(SFX_SUPPRESSED_REASON.EMBEDDED_OWNED)
    }

    // 알림 설정이 꺼진 사건은 재생하지 않는다.
    if (typeof entry.notificationKey === "string") {
      const settings = guard(() => getSettings?.(), null) ?? {}
      const notifications = settings.notifications
      const enabled = notifications?.[entry.notificationKey]
      if (enabled === false) {
        record(SFX_SUPPRESSED_REASON.NOTIFICATION_DISABLED, event, { stage: "settings" })
        return suppressed(SFX_SUPPRESSED_REASON.NOTIFICATION_DISABLED)
      }
    }

    if (currentMix.muted || currentMix.gain === 0) {
      record(SFX_SUPPRESSED_REASON.MUTED, event, { stage: "settings" })
      return suppressed(SFX_SUPPRESSED_REASON.MUTED)
    }

    const allowed = checkSfxAssetAllowed(entry)
    if (!allowed.allowed) {
      // AC-02: 미확인 자산은 매체를 만들지 않고 무음 사유만 남긴다.
      record(allowed.reason, event, { stage: "manifest", note: entry.silenceReason ?? null })
      return suppressed(allowed.reason)
    }

    if (entry.scope === SFX_SCOPE.UI) {
      const at = guard(now, 0)
      if (at - lastUiPlayAt < SFX_UI_COOLDOWN_MS) {
        record(SFX_SUPPRESSED_REASON.COOLDOWN, event, { stage: "cooldown" })
        return suppressed(SFX_SUPPRESSED_REASON.COOLDOWN)
      }
      lastUiPlayAt = at
    }

    const completion = startPlayback(entry, event, capturedGeneration)
    return { status: "accepted", reason: null, completion }
  }

  /**
   * F-27 영상 내장음용 소유권 선점(AC-05). 별도 dispatch와 **같은** 중복 키를 쓰므로
   * 한 사건에 별도 음과 내장음이 둘 다 나는 일이 없다.
   *
   * 최대 2초 제한·manifest 자산 검토는 적용하지 않는다 — 그 자산은 승인된 MOV이고,
   * 실제 변환·청음·동기 연결은 F-27 담당이다. 여기서 제공하는 것은 볼륨/mute 적용과
   * cleanup 계약뿐이다.
   *
   * @returns {{ status:'claimed'|'suppressed', reason:string|null, attach:(media:object)=>void, release:()=>void }}
   */
  function claimAudio(rawEvent, options) {
    const mode = options?.mode ?? "embedded"
    const admitted = admit(mode === "embedded" ? { ...rawEvent, audioMode: "embedded" } : rawEvent)
    if (!admitted.ok) {
      record(admitted.reason, admitted.event ?? rawEvent, { stage: "claim" })
      return { status: "suppressed", reason: admitted.reason, attach: () => {}, release: () => {} }
    }

    let released = false
    let attached = null

    return {
      status: "claimed",
      reason: null,
      /** 승인된 매체에만 현재 mix를 적용하고, 이후 변경도 함께 받게 한다. */
      attach(media) {
        if (released || media === null || typeof media !== "object") return
        attached = media
        embeddedMedia.add(media)
        applyMixToMedia(media, currentMix)
      },
      /** cleanup. 이후의 어떤 mix 변경도 이 매체를 건드리지 않는다. */
      release() {
        if (released) return
        released = true
        if (attached !== null) {
          embeddedMedia.delete(attached)
          attached = null
        }
      },
    }
  }

  function dispose() {
    if (disposed) return
    disposed = true
    stopActive(SFX_COMPLETION.STOPPED)
    handled.clear()
    mixListeners.clear()
    embeddedMedia.clear()
    if (typeof unsubscribeSettings === "function") guard(unsubscribeSettings, undefined)
  }

  return {
    dispatch,
    getMix,
    subscribeMix,
    claimAudio,
    syncScope,
    refreshMix,
    dispose,
    /** 무음 사유 기록 — 시험·증거 수집용이며 재생 판단에 쓰이지 않는다. */
    getSilenceLog: () => [...silenceLog],
  }
}
