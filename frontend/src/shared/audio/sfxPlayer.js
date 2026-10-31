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

export const SFX_COMPLETION = Object.freeze({
  PLAYED: "played",
  FAILED: "failed",
  TIMED_OUT: "timed-out",
  STOPPED: "stopped",
})

const SETTLED_STOPPED = Promise.resolve(SFX_COMPLETION.STOPPED)

function suppressed(reason) {
  return { status: "suppressed", reason, completion: SETTLED_STOPPED }
}

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
  let generation = 0
  const handled = new Map()
  let active = null
  let lastUiPlayAt = Number.NEGATIVE_INFINITY

  const mixListeners = new Set()
  const embeddedClaims = new Set()

  const silenceLog = []
  const SILENCE_LOG_LIMIT = 200

  let lastScope = readScope()
  let currentMix = computeMix()


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
    if (typeof onSilence === "function") guard(() => onSilence(entry), undefined)
  }

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
    for (const claim of [...embeddedClaims]) claim.release()

    if (accountChanged) {
      handled.clear()
    } else {
      if (gameChanged && previous.gameId !== null) dropKeysWithSegment(`game:${previous.gameId}`)
      if (roomChanged && previous.roomId !== null) dropKeysWithSegment(`room:${previous.roomId}`)
    }

    stopActive(SFX_COMPLETION.STOPPED)
  }

  function dropKeysWithSegment(segment) {
    for (const key of [...handled.keys()]) {
      if (key.includes(`|${segment}|`)) handled.delete(key)
    }
  }


  function computeMix() {
    const settings = guard(() => getSettings?.(), null) ?? {}
    const master = clampPercent(settings.masterVolume) / 100
    const sfx = clampPercent(settings.sfxVolume) / 100
    const muted = settings.sfxMuted === true
    const gain = master * sfx
    return { gain: muted ? 0 : gain, muted }
  }

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

  function silenceMedia(media) {
    guard(() => { media.muted = true }, undefined)
    guard(() => { media.volume = 0 }, undefined)
    guard(() => media.pause?.(), undefined)
  }

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

  function refreshMix() {
    if (disposed) return
    const next = computeMix()
    if (next.gain === currentMix.gain && next.muted === currentMix.muted) return
    currentMix = next
    const playing = active
    if (playing?.media && !applyMixToMedia(playing.media, currentMix)) {
      record("mix-apply-failed", playing.event, {stage:"mix"})
      playing.settle(SFX_COMPLETION.FAILED)
    }
    for (const claim of [...embeddedClaims]) claim.refresh(currentMix)
    for (const listener of [...mixListeners]) guard(() => listener(getMix()), undefined)
  }

  const unsubscribeSettings =
    typeof subscribeSettings === "function" ? guard(() => subscribeSettings(refreshMix), null) : null


  function checkScope(entry, event) {
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

  function buildKey(prefix, event) {
    return `${prefix}|${event.kind}|${event.eventId}|`
  }

  function admit(rawEvent) {
    if (disposed) return { ok: false, reason: SFX_SUPPRESSED_REASON.DISPOSED }

    const event = validateEvent(rawEvent)
    if (event === null) return { ok: false, reason: SFX_SUPPRESSED_REASON.INVALID_EVENT }

    const entry = lookupSfxAsset(manifest, event.kind)
    if (entry === null) return { ok: false, reason: SFX_SUPPRESSED_REASON.UNKNOWN_KIND, event }

    if (event.origin !== "live") return { ok: false, reason: SFX_SUPPRESSED_REASON.RESTORE_ORIGIN, event }

    syncScope()
    const scopeCheck = checkScope(entry, event)
    if (!scopeCheck.ok) return { ok: false, reason: scopeCheck.reason, event }

    const key = buildKey(scopeCheck.prefix, event)
    if (handled.has(key)) return { ok: false, reason: SFX_SUPPRESSED_REASON.DUPLICATE, event }

    handled.set(key, true)
    return { ok: true, entry, event, key, generation }
  }


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
      settle(result) {
        if (settled) return
        settled = true
        cleanup()
        if (active === handle) active = null
        resolveCompletion(result)
      },
    }

    const isStale = () => settled || disposed || capturedGeneration !== generation

    stopActive(SFX_COMPLETION.STOPPED)
    active = handle

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


  function dispatch(rawEvent) {
    const admitted = admit(rawEvent)
    if (!admitted.ok) {
      record(admitted.reason, admitted.event ?? rawEvent, { stage: "admit" })
      return suppressed(admitted.reason)
    }
    const { entry, event, generation: capturedGeneration } = admitted

    const allowed = checkSfxAssetAllowed(entry)
    if (!allowed.allowed) {
      record(allowed.reason, event, { stage: "manifest", note: entry.silenceReason ?? null })
      return suppressed(allowed.reason)
    }


    if (event.audioMode === "embedded" || entry.audioMode === "embedded") {
      record(SFX_SUPPRESSED_REASON.EMBEDDED_OWNED, event, { stage: "ownership" })
      return suppressed(SFX_SUPPRESSED_REASON.EMBEDDED_OWNED)
    }

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

  function claimAudio(rawEvent, options) {
    const mode = options?.mode ?? "embedded"
    const admitted = admit(mode === "embedded" ? { ...rawEvent, audioMode: "embedded" } : rawEvent)
    if (!admitted.ok) {
      record(admitted.reason, admitted.event ?? rawEvent, { stage: "claim" })
      return { status: "suppressed", reason: admitted.reason,attach:() => false,release: () => {
} }
    }

    let released = false
    let attached = null
    const owner = {
      refresh(mix) {
        if (attached && !applyMixToMedia(attached, mix)) {
          record("mix-apply-failed", admitted.event, {stage:"embedded"})
          release()
        }
      },
      release,
    }
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
    getSilenceLog: () => [...silenceLog],
  }
}
