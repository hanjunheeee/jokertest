// sfxPlayer.js: 소리 재생에 사용하는 실행·설정·공통 코드를 정의한다.
// 모듈 사용처: frontend/src/shared/hooks/useSfxRuntime.js

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

// SFX_COMPLETION: 호출한 freeze에서 받은 처리 결과
export const SFX_COMPLETION = Object.freeze({
  PLAYED: "played",
  FAILED: "failed",
  TIMED_OUT: "timed-out",
  STOPPED: "stopped",
})

// SETTLED_STOPPED: 호출한 resolve에서 받은 처리 결과
const SETTLED_STOPPED = Promise.resolve(SFX_COMPLETION.STOPPED)

// 소리 재생에서 호출받은 입력을 정리하고, 이 함수의 계산 결과를 호출한 쪽에 전달한다.
// reason: 이 결과가 나온 이유
function suppressed(reason) {
  return { status: "suppressed", reason, completion: SETTLED_STOPPED }
}

// 효과음 관련 작업에서 오류가 나면 지정한 기본값을 대신 돌려줘요.
// fn: 함수 값
// fallback: 대체 값
function guard(fn, fallback) {
  try {
    return fn()
  } catch {
    return fallback
  }
}

// 전달받은 백분율을 검사·변환해 이후 코드에서 일관된 형태로 사용하게 한다.
// value: 현재 다루는 값
function clampPercent(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

// 이벤트를 검사하고, 조건에 맞지 않는 요청이나 상태를 다음 처리 전에 걸러 낸다.
// event: 발생한 이벤트
function validateEvent(event) {
  if (event === null || typeof event !== "object" || Array.isArray(event)) return null
  // kind: 현재 항목의 종류
  // eventId: 발생한 이벤트에서 꺼낸 이벤트 ID 항목
  const { kind, eventId } = event
  if (typeof kind !== "string" || kind.trim().length === 0) return null
  if (typeof eventId !== "string" || eventId.trim().length === 0) return null

  // origin: 출처 값
  const origin = event.origin === "restore" ? "restore" : event.origin === "live" ? "live" : null
  if (origin === null) return null

  // audioMode: 조건에 따라 선택한 값
  const audioMode =
    event.audioMode === "embedded" ? "embedded" : event.audioMode === undefined || event.audioMode === "separate" ? "separate" : null
  if (audioMode === null) return null

  // value: 현재 다루는 값
  // 소리 재생에서 호출받은 입력을 정리하고, 이 함수의 계산 결과를 호출한 쪽에 전달한다.
  // value: 현재 다루는 값
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

// 현재 설정·계정·게임 소속과 리소스 로더를 연결해 효과음 재생기를 만든다. 재생 가능 여부와 음량을 확인하고 취소·실패·완료 상태를 관리한다.
// io: 방 참가자 전체나 특정 사용자에게 소켓 이벤트를 보내는 서버 객체
export function createSfxPlayer(io) {
  // manifest: 데이터를 계산·선택한 값에서 꺼낸 manifest 항목
  // getSettings: 데이터를 계산·선택한 값에서 꺼낸 getSettings 항목
  // subscribeSettings: 데이터를 계산·선택한 값에서 꺼낸 subscribeSettings 항목
  // getScope: 데이터를 계산·선택한 값에서 꺼낸 유효 범위 항목
  // loadAsset: 데이터를 계산·선택한 값에서 꺼낸 불러오기 파일 자원 항목
  // createMedia: 데이터를 계산·선택한 값에서 꺼낸 createMedia 항목
  // onSilence: 데이터를 계산·선택한 값에서 꺼낸 onSilence 항목
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
  // generation: 변경 확인 번호 값
  let generation = 0
  // handled: 키별 데이터를 보관하는 Map
  const handled = new Map()
  // active: 현재 사용 중인 값
  let active = null
  let lastUiPlayAt = Number.NEGATIVE_INFINITY

  // mixListeners: 중복 없는 항목을 보관하는 Set
  const mixListeners = new Set()
  // embeddedClaims: 중복 없는 항목을 보관하는 Set
  const embeddedClaims = new Set()

  // silenceLog: 처리에 필요한 항목 목록
  const silenceLog = []
  const SILENCE_LOG_LIMIT = 200

  // lastScope: 마지막 유효 범위 처리 결과
  let lastScope = readScope()
  // currentMix: 호출한 computeMix에서 받은 처리 결과
  let currentMix = computeMix()


  // 저장된 데이터나 현재 상태에서 유효 범위를 찾아 호출한 코드가 사용할 수 있게 한다.
  function readScope() {
    // scope: 유효 범위 처리 결과
    const scope = guard(() => getScope?.(), null)
    if (scope === null || typeof scope !== "object") return { accountId: null, gameId: null, roomId: null }
      // value: 현재 다루는 값
    // 소리 재생에서 호출받은 입력을 정리하고, 이 함수의 계산 결과를 호출한 쪽에 전달한다.
    // value: 현재 다루는 값
    const pick = (value) => (typeof value === "string" && value.trim().length > 0 ? value : null)
    return { accountId: pick(scope.accountId), gameId: pick(scope.gameId), roomId: pick(scope.roomId) }
  }

  // 기록을 현재 저장된 상태에 반영한다.
  // reason: 이 결과가 나온 이유
  // event: 발생한 이벤트
  function record(reason, event, extra) {
    // entry: 항목를 묶은 객체
    const entry = { reason, kind: event?.kind ?? null, eventId: event?.eventId ?? null, at: guard(now, 0), ...extra }
    silenceLog.push(entry)
    if (silenceLog.length > SILENCE_LOG_LIMIT) silenceLog.shift()
    if (typeof onSilence === "function") guard(() => onSilence(entry), undefined)
  }

  // 사용자의 유효 범위를 받아 소리 재생 상태와 화면에 반영한다.
  function syncScope() {
    if (disposed) return
    // next: 다음 처리로 넘길 함수
    const next = readScope()
    // accountChanged: 계정 변경된 값
    const accountChanged = next.accountId !== lastScope.accountId
    // gameChanged: 게임 변경된 값
    const gameChanged = next.gameId !== lastScope.gameId
    // roomChanged: 방 변경된 값
    const roomChanged = next.roomId !== lastScope.roomId
    if (!accountChanged && !gameChanged && !roomChanged) return

    // previous: 마지막 유효 범위 처리 결과
    const previous = lastScope
    lastScope = next
    generation += 1
    for (const claim of [...embeddedClaims]) claim.release()

    if (accountChanged) {
      handled.clear()
    } else {
      if (gameChanged && previous.gameId !== null) dropKeysWithSegment(`game:${previous.gameId}`)
      if (roomChanged && previous.roomId !== null) dropKeysWithSegment(`room:${previous.roomId}`)
    }

    stopActive(SFX_COMPLETION.STOPPED)
  }

  // 소리 재생에서 호출받은 입력을 정리하고, 이 함수의 계산 결과를 호출한 쪽에 전달한다.
  function dropKeysWithSegment(segment) {
    // key: 조회·저장에 쓸 키
    for (const key of [...handled.keys()]) {
      if (key.includes(`|${segment}|`)) handled.delete(key)
    }
  }


  // 현재 입력과 저장된 상태를 바탕으로 혼합 음량을 계산·선택한다.
  function computeMix() {
    // settings: 현재 설정
    const settings = guard(() => getSettings?.(), null) ?? {}
    const master = clampPercent(settings.masterVolume) / 100
    // sfx: 효과음 값
    const sfx = clampPercent(settings.sfxVolume) / 100
    // muted: 음소거 비교 결과
    const muted = settings.sfxMuted === true
    // gain: 음량 계수 값
    const gain = master * sfx
    return { gain: muted ? 0 : gain, muted }
  }

  // 저장된 데이터나 현재 상태에서 혼합 음량을 찾아 호출한 코드가 사용할 수 있게 한다.
  function getMix() {
    return { ...currentMix }
  }

  // 혼합 음량에 필요한 이벤트 처리·구독을 연결하거나 해제한다.
  // listener: 이벤트나 상태 변경을 받을 함수
  function subscribeMix(listener) {
    if (typeof listener !== "function") return () => {}
    mixListeners.add(listener)
    return () => {
      mixListeners.delete(listener)
    }
  }

  // media: 미디어 값
  // 소리 재생에서 호출받은 입력을 정리하고, 이 함수의 계산 결과를 호출한 쪽에 전달한다.
  // media: 미디어 값
  function silenceMedia(media) {
    guard(() => { media.muted = true }, undefined)
    guard(() => { media.volume = 0 }, undefined)
    guard(() => media.pause?.(), undefined)
  }

  // 혼합 음량 변환 미디어를 현재 저장된 상태에 반영한다.
  // media: 미디어 값
  // mix: 혼합 음량 값
  function applyMixToMedia(media, mix) {
    try {
      media.muted = true
      media.volume = mix.gain
      media.muted = mix.muted
      if (media.volume !== mix.gain || media.muted !== mix.muted) throw new Error("mix rejected")
      return true
    } catch {
      silenceMedia(media)
      return false
    }
  }

  // 소리 재생에서 호출받은 입력을 정리하고, 이 함수의 계산 결과를 호출한 쪽에 전달한다.
  function refreshMix() {
    if (disposed) return
    // next: 다음 처리로 넘길 함수
    const next = computeMix()
    if (next.gain === currentMix.gain && next.muted === currentMix.muted) return
    currentMix = next
    // playing: 현재 사용 중인 값
    const playing = active
    if (playing?.media && !applyMixToMedia(playing.media, currentMix)) {
      record("mix-apply-failed", playing.event, {stage:"mix"})
      playing.settle(SFX_COMPLETION.FAILED)
    }
    for (const claim of [...embeddedClaims]) claim.refresh(currentMix)
    // listener: 이벤트나 상태 변경을 받을 함수
    for (const listener of [...mixListeners]) guard(() => listener(getMix()), undefined)
  }

  // unsubscribeSettings: 조건에 따라 선택한 값
  const unsubscribeSettings =
    typeof subscribeSettings === "function" ? guard(() => subscribeSettings(refreshMix), null) : null


  // 유효 범위를 확인해, 현재 요청에 사용할 수 있는 상태인지 판단한다.
  // entry: 항목 값
  // event: 발생한 이벤트
  function checkScope(entry, event) {
    // scope: 마지막 유효 범위 처리 결과
    const scope = lastScope
    if (entry.scope === SFX_SCOPE.UI) {
      return { ok: true, prefix: `ui|${scope.accountId ?? "anon"}` }
    }

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

    return { ok: true, prefix: `acct:${scope.accountId}` }
  }

  // 다음 단계에서 사용할 키를 필요한 항목으로 구성한다.
  // event: 발생한 이벤트
  function buildKey(prefix, event) {
    return `${prefix}|${event.kind}|${event.eventId}|`
  }

  // 소리 재생에서 호출받은 입력을 정리하고, 이 함수의 계산 결과를 호출한 쪽에 전달한다.
  function admit(rawEvent) {
    if (disposed) return { ok: false, reason: SFX_SUPPRESSED_REASON.DISPOSED }

    // event: 발생한 이벤트
    const event = validateEvent(rawEvent)
    if (event === null) return { ok: false, reason: SFX_SUPPRESSED_REASON.INVALID_EVENT }

    // entry: 항목 처리 결과
    const entry = lookupSfxAsset(manifest, event.kind)
    if (entry === null) return { ok: false, reason: SFX_SUPPRESSED_REASON.UNKNOWN_KIND, event }

    if (event.origin !== "live") return { ok: false, reason: SFX_SUPPRESSED_REASON.RESTORE_ORIGIN, event }

    syncScope()
    // scopeCheck: 호출한 checkScope에서 받은 처리 결과
    const scopeCheck = checkScope(entry, event)
    if (!scopeCheck.ok) return { ok: false, reason: scopeCheck.reason, event }

    // key: 조회·저장에 쓸 키
    const key = buildKey(scopeCheck.prefix, event)
    if (handled.has(key)) return { ok: false, reason: SFX_SUPPRESSED_REASON.DUPLICATE, event }

    handled.set(key, true)
    return { ok: true, entry, event, key, generation }
  }


  // 더는 사용하지 않을 활성을 정리하거나 해제한다.
  // reason: 이 결과가 나온 이유
  function stopActive(reason) {
    if (active === null) return
    // current: 현재 사용 중인 값
    const current = active
    active = null
    current.settle(reason)
  }

  // 재생을 시작하거나 현재 진행 상태에 맞춰 다음 단계로 넘긴다.
  // entry: 항목 값
  // event: 발생한 이벤트
  function startPlayback(entry, event, capturedGeneration) {
    // settled: 완료된 작업의 처리 결과
    let settled = false
    // media: 미디어 값
    let media = null
    // loadTimer: 타이머 값
    let loadTimer = null
    let watchdog = null
    let detachListeners = null
    // 로더가 검증한 바이트로 만든 임시 소스(blob URL 등)의 해제 함수.
    let releaseSrc = null
    // resolveCompletion: 완료 값
    let resolveCompletion
    // completion: Promise 객체
    const completion = new Promise((resolve) => {
      resolveCompletion = resolve
    })

      // 소리 재생에서 호출받은 입력을 정리하고, 이 함수의 계산 결과를 호출한 쪽에 전달한다.
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
        // release: 해제 값
        const release = releaseSrc
        releaseSrc = null
        guard(release, undefined)
      }
    }

    // handle: 처리를 묶은 객체
    const handle = {
      event,
          // 소리 재생에서 호출받은 입력을 정리하고, 이 함수의 계산 결과를 호출한 쪽에 전달한다.
          get media() {
        return media
      },
      // 결과 확정을 시작하거나 현재 진행 상태에 맞춰 다음 단계로 넘긴다.
      // result: 이번 처리 결과
      settle(result) {
        if (settled) return
        settled = true
        cleanup()
        if (active === handle) active = null
        resolveCompletion(result)
      },
    }

    // 유효 기간·소속이 지난을 확인해, 현재 요청에 사용할 수 있는 상태인지 판단한다.
    const isStale = () => settled || disposed || capturedGeneration !== generation

    stopActive(SFX_COMPLETION.STOPPED)
    active = handle

    loadTimer = guard(() => setTimer(() => handle.settle(SFX_COMPLETION.TIMED_OUT), SFX_LOAD_TIMEOUT_MS), null)
    if (loadTimer == null || settled) {
      record("timer-install-failed", event, {stage:"load"})
      handle.settle(SFX_COMPLETION.FAILED)
      return completion
    }

    // loadControl: 불러오기 조작를 묶은 객체
    const loadControl = { /* 소리 재생 정보를 확인해, 현재 요청에 사용할 수 있는 상태인지 판단한다. */ isCancelled: /* 소리 재생에서 Cancelled 조건을 확인한다. | 관련 함수: isStale (frontend/src/shared/audio/sfxPlayer.js) */ () => isStale() }
    // loading: 불러오는 중 값
    let loading
    try {
      loading = Promise.resolve(loadAsset(entry, loadControl))
    } catch {
      handle.settle(SFX_COMPLETION.FAILED)
      return completion
    }

    loading.then(
      (loaded) => {
        // release: 조건에 따라 선택한 값
        const release = typeof loaded?.release === "function" ? loaded.release : null
        if (isStale()) {
          if (release !== null) guard(release, undefined)
          handle.settle(SFX_COMPLETION.STOPPED)
          return
        }
        // 이 시점부터는 cleanup이 해제를 책임진다(아래 실패 경로들도 settle→cleanup을 거친다).
        releaseSrc = release
        // verified: 요청·현재 상태의 검사 결과
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

    // 미디어를 시작하거나 현재 진행 상태에 맞춰 다음 단계로 넘긴다.
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

      if (!applyMixToMedia(media, currentMix)) {
        record("mix-apply-failed", event, {stage:"media"})
        handle.settle(SFX_COMPLETION.FAILED)
        return
      }

      // 사용자의 종료된을 받아 소리 재생 상태와 화면에 반영한다.
      const onEnded = () => handle.settle(SFX_COMPLETION.PLAYED)
      // 사용자의 오류를 받아 소리 재생 상태와 화면에 반영한다.
      const onError = () => handle.settle(SFX_COMPLETION.FAILED)
      if (typeof media.addEventListener === "function") {
        // target: 대상 값
        const target = media
        guard(() => target.addEventListener("ended", onEnded), undefined)
        guard(() => target.addEventListener("error", onError), undefined)
        // 더는 사용하지 않을 소리 재생 정보를 정리하거나 해제한다.
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

      watchdog = guard(
        () => setTimer(() => handle.settle(SFX_COMPLETION.TIMED_OUT), entry.durationMs + SFX_PLAYBACK_WATCHDOG_MS),
        null,
      )

      if (watchdog == null || settled) {
        record("timer-install-failed", event, {stage:"play"})
        handle.settle(SFX_COMPLETION.FAILED)
        return
      }

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


  // 소리 재생에서 호출받은 입력을 정리하고, 이 함수의 계산 결과를 호출한 쪽에 전달한다.
  function dispatch(rawEvent) {
    // admitted: 호출한 admit에서 받은 처리 결과
    const admitted = admit(rawEvent)
    if (!admitted.ok) {
      record(admitted.reason, admitted.event ?? rawEvent, { stage: "admit" })
      return suppressed(admitted.reason)
    }
    // entry: 호출한 admit에서 받은 처리 결과에서 꺼낸 항목 항목
    // event: 발생한 이벤트
    // capturedGeneration: 호출한 admit에서 받은 처리 결과에서 꺼낸 변경 확인 번호 항목
    const { entry, event, generation: capturedGeneration } = admitted

    // allowed: 허용 처리 결과
    const allowed = checkSfxAssetAllowed(entry)
    if (!allowed.allowed) {
      record(allowed.reason, event, { stage: "manifest", note: entry.silenceReason ?? null })
      return suppressed(allowed.reason)
    }


    // 내장음이 소유한 사건에는 별도 음을 내지 않는다.
    if (event.audioMode === "embedded" || entry.audioMode === "embedded") {
      record(SFX_SUPPRESSED_REASON.EMBEDDED_OWNED, event, { stage: "ownership" })
      return suppressed(SFX_SUPPRESSED_REASON.EMBEDDED_OWNED)
    }

    if (typeof entry.notificationKey === "string") {
      // settings: 현재 설정
      const settings = guard(() => getSettings?.(), null) ?? {}
      // notifications: 현재 설정에서 읽은 notifications 항목
      const notifications = settings.notifications
      // enabled: 사용 가능; 원본 목록에서 선택한 값
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


    if (entry.scope === SFX_SCOPE.UI) {
      // at: 호출한 guard에서 받은 처리 결과
      const at = guard(now, 0)
      if (at - lastUiPlayAt < SFX_UI_COOLDOWN_MS) {
        record(SFX_SUPPRESSED_REASON.COOLDOWN, event, { stage: "cooldown" })
        return suppressed(SFX_SUPPRESSED_REASON.COOLDOWN)
      }
      lastUiPlayAt = at
    }

    // completion: 호출한 startPlayback에서 받은 처리 결과
    const completion = startPlayback(entry, event, capturedGeneration)
    return { status: "accepted", reason: null, completion }
  }

  // 소리 재생에서 호출받은 입력을 정리하고, 이 함수의 계산 결과를 호출한 쪽에 전달한다.
  // options: 선택 설정
  function claimAudio(rawEvent, options) {
    // mode: 모드를 계산·선택한 값
    const mode = options?.mode ?? "embedded"
    // admitted: 호출한 admit에서 받은 처리 결과
    const admitted = admit(mode === "embedded" ? { ...rawEvent, audioMode: "embedded" } : rawEvent)
    if (!admitted.ok) {
      record(admitted.reason, admitted.event ?? rawEvent, { stage: "claim" })
      return { status: "suppressed", reason: admitted.reason, /* 연결에 필요한 이벤트 처리·구독을 연결하거나 해제한다. */ attach: /* 소리 재생의 연결에 연결할 처리·구독을 관리한다. */ () => false, /* 더는 사용하지 않을 해제를 정리하거나 해제한다. */ release: () => {
} }
    }

    let released = false
    let attached = null
    // owner: 작업 소유자를 묶은 객체
    const owner = {
      // 소리 재생에서 호출받은 입력을 정리하고, 이 함수의 계산 결과를 호출한 쪽에 전달한다.
      // mix: 혼합 음량 값
      refresh(mix) {
        if (attached && !applyMixToMedia(attached, mix)) {
          record("mix-apply-failed", admitted.event, {stage:"embedded"})
          release()
        }
      },
      release,
    }
    // 더는 사용하지 않을 해제를 정리하거나 해제한다.
    function release() {
      if (released) return
      released = true
      embeddedClaims.delete(owner)
      if (attached !== null) {
        silenceMedia(attached)
        attached = null
      }
    }
    embeddedClaims.add(owner)
    return {
      status: "claimed",
      reason: null,
      // 연결에 필요한 이벤트 처리·구독을 연결하거나 해제한다.
      // media: 미디어 값
      attach(media) {
        syncScope()
        if (disposed || released || admitted.generation !== generation || media === null || typeof media !== "object") return false
        if (attached !== null) return attached === media
        if (!applyMixToMedia(media, currentMix)) {
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

  // 이전에 저장된 소리 재생 기록을 비워 새 상태로 시작할 수 있게 한다.
  function dispose() {
    if (disposed) return
    disposed = true
    stopActive(SFX_COMPLETION.STOPPED)
    handled.clear()
    mixListeners.clear()
    for (const claim of [...embeddedClaims]) claim.release()
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
    // 저장된 데이터나 현재 상태에서 소리 재생 정보를 찾아 호출한 코드가 사용할 수 있게 한다.
    getSilenceLog: () => [...silenceLog],
  }
}
