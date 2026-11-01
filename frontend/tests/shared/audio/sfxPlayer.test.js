import test from "node:test"
import assert from "node:assert/strict"
import { JSDOM } from "jsdom"

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { pretendToBeVisual: true, url: "http://127.0.0.1:5183" })

function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}

installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("MouseEvent", dom.window.MouseEvent)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("localStorage", dom.window.localStorage)

const { createSfxPlayer, SFX_COMPLETION } = await import("../../../src/shared/audio/sfxPlayer.js")
const {
  SFX_MANIFEST,
  SFX_REVIEW_STATUS,
  SFX_CLASSIFICATION,
  SFX_SUPPRESSED_REASON,
  SFX_SCOPE,
  MAX_SEPARATE_SFX_DURATION_MS,
  SFX_LOAD_TIMEOUT_MS,
  checkSfxAssetAllowed,
  listSilencedSfxKinds,
} = await import("../../../src/shared/audio/sfxManifest.js")
const { useSettingsStore, buildDefaultSoundVolumes, SFX_MUTED_DEFAULT } = await import(
  "../../../src/domains/settings/store/settingsStore.js"
)

const GOOD_HASH = "sha256-fixture-ok"

function approvedEntry(overrides = {}) {
  return {
    scope: SFX_SCOPE.GAME,
    notificationKey: null,
    reviewStatus: SFX_REVIEW_STATUS.APPROVED,
    silenceReason: null,
    source: "fixture://test",
    creator: "test-fixture",
    usageTerms: "test-only",
    sha256: GOOD_HASH,
    src: "/fixture/ok.wav",
    durationMs: 500,
    classification: SFX_CLASSIFICATION.SHORT_NON_MUSICAL,
    ...overrides,
  }
}

const FIXTURE_MANIFEST = {
  "test-game": approvedEntry(),
  "test-account": approvedEntry({ scope: SFX_SCOPE.ACCOUNT }),
  "test-room": approvedEntry({ scope: SFX_SCOPE.ROOM }),
  "test-ui": approvedEntry({ scope: SFX_SCOPE.UI }),
  "test-notified": approvedEntry({ scope: SFX_SCOPE.ACCOUNT, notificationKey: "friend-invite" }),
  "test-unreviewed": approvedEntry({ reviewStatus: SFX_REVIEW_STATUS.NEEDS_REVIEW, sha256: null, src: null }),
  "test-music": approvedEntry({ classification: SFX_CLASSIFICATION.MUSIC }),
  "test-too-long": approvedEntry({ durationMs: MAX_SEPARATE_SFX_DURATION_MS + 1 }),
  "test-embedded": approvedEntry({ audioMode: "embedded" }),
}

function createClock() {
  let currentTime = 0
  let nextId = 1
  const timers = new Map()
  return {
    now: () => currentTime,
    setTimer(fn, ms) {
      const id = nextId++
      timers.set(id, { at: currentTime + ms, fn })
      return id
    },
    clearTimer(id) {
      timers.delete(id)
    },
    advance(ms) {
      const target = currentTime + ms
      let guard = 0
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)
        if (due.length === 0 || guard++ > 1000) break
        const [id, timer] = due[0]
        timers.delete(id)
        currentTime = timer.at
        timer.fn()
      }
      currentTime = target
    },
    pendingCount: () => timers.size,
  }
}

function createMediaRecorder(options = {}) {
  const created = []
  const factory = (src) => {
    if (options.throwOnCreate) throw new Error("create failed")
    const listeners = new Map()
    let resolvePlay
    let rejectPlay
    const playPromise =
      options.playMode === "pending"
        ? new Promise(() => {})
        : new Promise((resolve, reject) => {
            resolvePlay = resolve
            rejectPlay = reject
          })
    const media = {
      src,
      volume: 1,
      muted: false,
      playCalls: 0,
      pauseCalls: 0,
      addEventListener(type, handler) {
        if (!listeners.has(type)) listeners.set(type, new Set())
        listeners.get(type).add(handler)
      },
      removeEventListener(type, handler) {
        listeners.get(type)?.delete(handler)
      },
      play() {
        media.playCalls += 1
        if (options.playThrows) throw new Error("play threw")
        return playPromise
      },
      pause() {
        media.pauseCalls += 1
      },
      emit(type) {
        for (const handler of [...(listeners.get(type) ?? [])]) handler()
      },
      resolvePlay: () => resolvePlay?.(),
      rejectPlay: () => rejectPlay?.(new Error("autoplay blocked")),
    }
    playPromise.catch(() => {})
    created.push(media)
    return media
  }
  factory.created = created
  return factory
}

const DEFAULT_SETTINGS = { masterVolume: 100, sfxVolume: 80, sfxMuted: false, notifications: {} }

function makePlayer(overrides = {}) {
  const clock = createClock()
  const createMedia = overrides.createMedia ?? createMediaRecorder()
  const state = {
    settings: { ...DEFAULT_SETTINGS, ...(overrides.settings ?? {}) },
    scope: { accountId: "acct-1", gameId: "game-1", roomId: "room-1", ...(overrides.scope ?? {}) },
  }
  const settingsListeners = new Set()
  const loads = []
  const loadAsset =
    overrides.loadAsset ??
    ((entry) => {
      const deferred = {}
      const promise = new Promise((resolve, reject) => {
        deferred.resolve = resolve
        deferred.reject = reject
      })
      loads.push({ entry, ...deferred })
      return promise
    })

  const player = createSfxPlayer({
    manifest: overrides.manifest ?? FIXTURE_MANIFEST,
    getSettings: () => state.settings,
    subscribeSettings: (listener) => {
      settingsListeners.add(listener)
      return () => settingsListeners.delete(listener)
    },
    getScope: () => state.scope,
    loadAsset,
    createMedia,
    now: clock.now,
    setTimer: overrides.setTimer ?? clock.setTimer,
    clearTimer: clock.clearTimer,
  })

  return {
    player,
    clock,
    loads,
    media: createMedia.created ?? [],
    setSettings(next) {
      state.settings = { ...state.settings, ...next }
      for (const listener of [...settingsListeners]) listener()
    },
    setScope(next) {
      state.scope = { ...state.scope, ...next }
      player.syncScope()
    },
  }
}

const gameEvent = (eventId, extra = {}) => ({
  kind: "test-game",
  eventId,
  accountId: "acct-1",
  gameId: "game-1",
  origin: "live",
  ...extra,
})

async function settleLoads(harness, index = 0) {
  harness.loads[index]?.resolve({ sha256: GOOD_HASH, src: "/fixture/ok.wav" })
  await flush()
}

async function flush() {
  for (let i = 0; i < 8; i += 1) await Promise.resolve()
}

test("AC-02 배포 manifest의 별도 효과음은 전부 자작 합성 승인 자산이고, 경로·해시는 생성 스크립트의 실제 값이다", () => {
  const kinds = Object.keys(SFX_MANIFEST)
  assert.ok(kinds.length > 0)
  const separate = kinds.filter((kind) => SFX_MANIFEST[kind].audioMode !== "embedded")
  assert.ok(separate.length >= 20)
  for (const kind of separate) {
    const entry = SFX_MANIFEST[kind]
    assert.equal(entry.reviewStatus, SFX_REVIEW_STATUS.APPROVED, `${kind}가 승인 상태가 아니다`)
    assert.equal(entry.src, `/sfx/${kind}.wav`, `${kind}의 경로가 생성 규칙과 다르다`)
    assert.match(entry.sha256, /^[0-9a-f]{64}$/, `${kind}의 sha256이 실제 해시 형식이 아니다`)
    assert.ok(Number.isFinite(entry.durationMs) && entry.durationMs > 0 && entry.durationMs <= 2000, `${kind}의 길이가 상한을 넘는다`)
    assert.match(entry.source, /gen-sfx/, "출처는 저장소의 합성 스크립트여야 한다")
    assert.equal(typeof entry.usageTerms, "string")
    assert.equal(checkSfxAssetAllowed(entry).allowed, true, `${kind}가 허용되지 않는다`)
  }
  assert.deepEqual(listSilencedSfxKinds().map((x) => x.kind), kinds.filter((kind) => SFX_MANIFEST[kind].audioMode === "embedded"))
})

test("AC-02 미검토 자산은 매체를 아예 만들지 않고 사유만 남긴다", () => {
  const h = makePlayer()
  const result = h.player.dispatch(gameEvent("e1", { kind: "test-unreviewed" }))

  assert.equal(result.status, "suppressed")
  assert.equal(result.reason, SFX_SUPPRESSED_REASON.ASSET_UNREVIEWED)
  assert.equal(h.media.length, 0, "미검토 자산에 매체가 만들어졌다")
  assert.equal(h.loads.length, 0, "미검토 자산을 로드하려 했다")
  assert.ok(h.player.getSilenceLog().some((r) => r.reason === SFX_SUPPRESSED_REASON.ASSET_UNREVIEWED))
})

test("AC-02 음악 분류·길이 초과 자산은 별도 효과음으로 재생되지 않는다", () => {
  const h = makePlayer()
  assert.equal(h.player.dispatch(gameEvent("m1", { kind: "test-music" })).reason, SFX_SUPPRESSED_REASON.ASSET_MUSIC)
  assert.equal(
    h.player.dispatch(gameEvent("l1", { kind: "test-too-long" })).reason,
    SFX_SUPPRESSED_REASON.ASSET_TOO_LONG,
  )
  assert.equal(h.media.length, 0)
})

test("AC-02 해시가 검토 기록과 다르면 로드 후에도 매체를 만들지 않는다", async () => {
  const h = makePlayer()
  const result = h.player.dispatch(gameEvent("h1"))
  assert.equal(result.status, "accepted")

  h.loads[0].resolve({ sha256: "sha256-tampered", src: "/fixture/ok.wav" })
  await flush()

  assert.equal(h.media.length, 0, "해시 불일치인데 매체가 만들어졌다")
  assert.equal(await result.completion, SFX_COMPLETION.FAILED)
  assert.ok(h.player.getSilenceLog().some((r) => r.reason === SFX_SUPPRESSED_REASON.ASSET_HASH_MISMATCH))
})

test("AC-03 gain은 Master × SFX의 곱이고 음소거면 유효 gain이 0이다", () => {
  const h = makePlayer({ settings: { masterVolume: 50, sfxVolume: 40 } })
  assert.equal(h.player.getMix().gain, 0.2)
  assert.equal(h.player.getMix().muted, false)

  h.setSettings({ sfxMuted: true })
  assert.deepEqual(h.player.getMix(), { gain: 0, muted: true })

  h.setSettings({ masterVolume: 100, sfxVolume: 100 })
  assert.deepEqual(h.player.getMix(), { gain: 0, muted: true })

  h.setSettings({ sfxMuted: false })
  assert.deepEqual(h.player.getMix(), { gain: 1, muted: false })
})

test("AC-03 기본 설정값의 gain은 0.8이고 초기화가 그 값으로 되돌린다", () => {
  const defaults = buildDefaultSoundVolumes()
  assert.equal(defaults["master-volume"], 100)
  assert.equal(defaults["sfx-volume"], 80)
  assert.equal(SFX_MUTED_DEFAULT, false)

  const h = makePlayer({
    settings: { masterVolume: defaults["master-volume"], sfxVolume: defaults["sfx-volume"], sfxMuted: false },
  })
  assert.equal(Math.round(h.player.getMix().gain * 100) / 100, 0.8)
})

test("AC-03 settingsStore가 sfxMuted를 저장·복원·초기화한다", () => {
  const store = useSettingsStore.getState()
  store.setVolume("master-volume", 50)
  store.setVolume("sfx-volume", 40)
  store.setSfxMuted(true)
  assert.equal(useSettingsStore.getState().sfxMuted, true)

  useSettingsStore.getState().setSfxMuted("true")
  assert.equal(useSettingsStore.getState().sfxMuted, true)
  useSettingsStore.getState().setSfxMuted(null)
  assert.equal(useSettingsStore.getState().sfxMuted, true)

  useSettingsStore.getState().resetSettings()
  assert.equal(useSettingsStore.getState().sfxMuted, SFX_MUTED_DEFAULT)
  assert.deepEqual(useSettingsStore.getState().volumes, buildDefaultSoundVolumes())

  const raw = dom.window.localStorage.getItem("settings-storage")
  assert.ok(raw !== null)
  assert.equal(Object.hasOwn(JSON.parse(raw).state, "sfxMuted"), true)
})

test("AC-03 음소거 상태에서는 매체를 만들지 않는다", () => {
  const h = makePlayer({ settings: { sfxMuted: true } })
  const result = h.player.dispatch(gameEvent("mute-1"))
  assert.equal(result.reason, SFX_SUPPRESSED_REASON.MUTED)
  assert.equal(h.media.length, 0)
  assert.equal(h.loads.length, 0)
})

test("AC-03 재생 중 볼륨/음소거 변경이 활성 매체에 즉시 반영되고 구독자에게 통지된다", async () => {
  const h = makePlayer({ settings: { masterVolume: 100, sfxVolume: 50 } })
  const seen = []
  h.player.subscribeMix((mix) => seen.push(mix))

  h.player.dispatch(gameEvent("v1"))
  await settleLoads(h)
  assert.equal(h.media.length, 1)
  assert.equal(h.media[0].volume, 0.5)

  h.setSettings({ sfxMuted: true })
  assert.equal(h.media[0].volume, 0)
  assert.equal(h.media[0].muted, true)
  assert.deepEqual(seen.at(-1), { gain: 0, muted: true })
})

test("AC-04 같은 사건을 로드 중에 다시 보내도 매체는 최대 하나다", async () => {
  const h = makePlayer()
  const first = h.player.dispatch(gameEvent("dup-1"))
  const second = h.player.dispatch(gameEvent("dup-1"))

  assert.equal(first.status, "accepted")
  assert.equal(second.status, "suppressed")
  assert.equal(second.reason, SFX_SUPPRESSED_REASON.DUPLICATE)

  await settleLoads(h)
  assert.equal(h.media.length, 1)
  assert.equal(h.loads.length, 1)
})

test("AC-04 재생 완료 뒤 재전송·리렌더에도 추가 재생이 없다", async () => {
  const h = makePlayer()
  const first = h.player.dispatch(gameEvent("done-1"))
  await settleLoads(h)
  h.media[0].emit("ended")
  assert.equal(await first.completion, SFX_COMPLETION.PLAYED)

  assert.equal(h.player.dispatch(gameEvent("done-1")).reason, SFX_SUPPRESSED_REASON.DUPLICATE)
  assert.equal(h.media.length, 1)
})

test("AC-04 복원(origin=restore)은 소리를 내지 않고 표식도 남기지 않는다", async () => {
  const h = makePlayer()
  const restored = h.player.dispatch(gameEvent("r-1", { origin: "restore" }))
  assert.equal(restored.reason, SFX_SUPPRESSED_REASON.RESTORE_ORIGIN)
  assert.equal(h.loads.length, 0)

  assert.equal(h.player.dispatch(gameEvent("r-1")).status, "accepted")
})

test("AC-04 mute/알림 off로 억제된 유효 사건은 설정을 켜도 다시 재생되지 않는다", () => {
  const h = makePlayer({ settings: { sfxMuted: true } })
  assert.equal(h.player.dispatch(gameEvent("late-1")).reason, SFX_SUPPRESSED_REASON.MUTED)

  h.setSettings({ sfxMuted: false })
  assert.equal(h.player.dispatch(gameEvent("late-1")).reason, SFX_SUPPRESSED_REASON.DUPLICATE)
  assert.equal(h.media.length, 0)

  assert.equal(h.player.dispatch(gameEvent("late-2")).status, "accepted")
})

test("AC-04 알림 설정이 꺼진 사건은 매체를 만들지 않는다", () => {
  const h = makePlayer({ settings: { notifications: { "friend-invite": false } } })
  const result = h.player.dispatch({
    kind: "test-notified",
    eventId: "n-1",
    accountId: "acct-1",
    origin: "live",
  })
  assert.equal(result.reason, SFX_SUPPRESSED_REASON.NOTIFICATION_DISABLED)
  assert.equal(h.media.length, 0)
})

test("AC-04 계정 전환 중 도착한 늦은 로드는 이전 계정의 매체를 만들지 않는다", async () => {
  const h = makePlayer()
  const pending = h.player.dispatch(gameEvent("acct-swap"))
  assert.equal(pending.status, "accepted")

  h.setScope({ accountId: "acct-2" })
  await settleLoads(h)

  assert.equal(h.media.length, 0, "이전 계정의 사건이 매체를 만들었다")
  assert.equal(await pending.completion, SFX_COMPLETION.STOPPED)
})

test("AC-04 게임 전환 중 도착한 늦은 로드는 이전 게임의 매체를 만들지 않는다", async () => {
  const h = makePlayer()
  const pending = h.player.dispatch(gameEvent("game-swap"))
  h.setScope({ gameId: "game-2" })
  await settleLoads(h)

  assert.equal(h.media.length, 0)
  assert.equal(await pending.completion, SFX_COMPLETION.STOPPED)
  assert.equal(h.player.dispatch(gameEvent("game-swap")).reason, SFX_SUPPRESSED_REASON.GAME_MISMATCH)
})

test("AC-04 UI 연타는 cooldown으로 억제되고 큐에 쌓이지 않는다", async () => {
  const h = makePlayer()
  const ui = (id) => ({ kind: "test-ui", eventId: id, origin: "live" })

  const first = h.player.dispatch(ui("ui-1"))
  assert.equal(first.status, "accepted")
  const second = h.player.dispatch(ui("ui-2"))
  assert.equal(second.reason, SFX_SUPPRESSED_REASON.COOLDOWN)

  await settleLoads(h)
  assert.equal(h.media.length, 1, "연타로 소리가 쌓였다")
})

test("AC-05 서버가 허용한 계정이 아니면 재생하지 않는다", () => {
  const h = makePlayer()
  const result = h.player.dispatch(gameEvent("other-1", { accountId: "acct-other" }))
  assert.equal(result.reason, SFX_SUPPRESSED_REASON.ACCOUNT_MISMATCH)
  assert.equal(h.media.length, 0)
})

test("AC-05 익명(로그아웃) 범위에서는 서버 사건을 받아들이지 않는다", () => {
  const h = makePlayer({ scope: { accountId: null } })
  const result = h.player.dispatch(gameEvent("anon-1"))
  assert.equal(result.reason, SFX_SUPPRESSED_REASON.ANONYMOUS_SCOPE)

  assert.equal(h.player.dispatch({ kind: "test-ui", eventId: "anon-ui", origin: "live" }).status, "accepted")
})

test("AC-05 다른 게임/다른 방의 사건은 재생하지 않는다", () => {
  const h = makePlayer()
  assert.equal(h.player.dispatch(gameEvent("g-x", { gameId: "game-9" })).reason, SFX_SUPPRESSED_REASON.GAME_MISMATCH)
  assert.equal(
    h.player.dispatch({ kind: "test-room", eventId: "r-x", accountId: "acct-1", roomId: "room-9", origin: "live" })
      .reason,
    SFX_SUPPRESSED_REASON.ROOM_MISMATCH,
  )
  assert.equal(h.media.length, 0)
})

test("AC-05 separate → embedded 이중 claim은 두 번째가 억제된다", async () => {
  const h = makePlayer()
  assert.equal(h.player.dispatch(gameEvent("own-1")).status, "accepted")

  const claim = h.player.claimAudio(gameEvent("own-1"), { mode: "embedded" })
  assert.equal(claim.status, "suppressed")
  assert.equal(claim.reason, SFX_SUPPRESSED_REASON.DUPLICATE)
})

test("AC-05 embedded → separate 이중 claim도 두 번째가 억제된다", () => {
  const h = makePlayer()
  const claim = h.player.claimAudio(gameEvent("own-2"), { mode: "embedded" })
  assert.equal(claim.status, "claimed")

  const late = h.player.dispatch(gameEvent("own-2"))
  assert.equal(late.reason, SFX_SUPPRESSED_REASON.DUPLICATE)
  assert.equal(h.media.length, 0, "내장음 소유 사건에 별도 음이 났다")
})

test("AC-05 manifest가 embedded로 표시한 사건에는 별도 음을 내지 않는다", () => {
  const h = makePlayer()
  const result = h.player.dispatch(gameEvent("emb-1", { kind: "test-embedded" }))
  assert.equal(result.reason, SFX_SUPPRESSED_REASON.EMBEDDED_OWNED)
  assert.equal(h.media.length, 0)
})

test("F-27c(AC-04) night-success-video는 GAME 범위·embedded·5개 URL 선택표로 배포 manifest에 등록돼 있다", () => {
  const entry = SFX_MANIFEST["night-success-video"]
  assert.ok(entry, "night-success-video kind가 배포 manifest에 없다")
  assert.equal(entry.scope, SFX_SCOPE.GAME)
  assert.equal(entry.notificationKey, null)
  assert.equal(entry.audioMode, "embedded")
  assert.equal(entry.src, null)
  assert.equal(entry.sha256, null)

  const table = entry.embeddedVideos
  assert.deepEqual(Object.keys(table).sort(), [
    "CONFIRM-USER", "HEAL-TARGET", "HEAL-USER", "INVESTIGATE-USER", "KILL-TARGET", "KILL-USER",
  ])
  for (const [key, src] of Object.entries(table)) {
    assert.equal(typeof src, "string", `${key} 경로가 문자열이 아니다`)
    assert.ok(src.startsWith("/video-direction/"), `${key} 경로가 /video-direction/ 아래가 아니다: ${src}`)
    assert.ok(src.endsWith("-stacked.mp4"), `${key} 경로가 -stacked.mp4가 아니다: ${src}`)
    assert.equal(src.endsWith(".webm"), false, `${key} 경로가 .webm을 요청했다: ${src}`)
  }
  assert.equal(table["INVESTIGATE-TARGET"], undefined)
  assert.equal(table["CONFIRM-TARGET"], undefined)
})

test("F-27c(AC-04) night-success-video를 별도 dispatch해도 매체·로드가 전혀 만들어지지 않는다", () => {
  const h = makePlayer({ manifest: SFX_MANIFEST })
  const result = h.player.dispatch(gameEvent("role-video-1", { kind: "night-success-video" }))
  assert.equal(result.status, "suppressed")
  assert.equal(h.media.length, 0, "night-success-video 별도 dispatch가 매체를 만들었다")
  assert.equal(h.loads.length, 0, "night-success-video 별도 dispatch가 자산을 로드하려 했다")
})

test("AC-05 claimAudio는 mix를 매체에 적용하고 cleanup 뒤에는 건드리지 않는다", () => {
  const h = makePlayer({ settings: { masterVolume: 100, sfxVolume: 50 } })
  const claim = h.player.claimAudio(gameEvent("mov-1"), { mode: "embedded" })
  assert.equal(claim.status, "claimed")

  const video = { volume: 1, muted: false }
  claim.attach(video)
  assert.equal(video.volume, 0.5)
  assert.equal(video.muted, false)

  h.setSettings({ sfxMuted: true })
  assert.equal(video.volume, 0)
  assert.equal(video.muted, true)

  claim.release()
  h.setSettings({ sfxMuted: false, sfxVolume: 100 })
  assert.equal(video.volume, 0, "release 뒤의 늦은 mix 변경이 매체를 건드렸다")
  assert.equal(video.muted, true)
})

test("AC-05 내장음의 최대 2초 제한은 별도 SFX에만 적용된다", () => {
  const h = makePlayer()
  const claim = h.player.claimAudio(gameEvent("mov-long", { kind: "test-too-long" }), { mode: "embedded" })
  assert.equal(claim.status, "claimed")
  assert.equal(h.player.dispatch(gameEvent("mov-long", { kind: "test-too-long" })).reason, SFX_SUPPRESSED_REASON.DUPLICATE)
})

test("AC-06 정상 경로는 played로 정착하고 활성 매체를 남기지 않는다", async () => {
  const h = makePlayer()
  const result = h.player.dispatch(gameEvent("ok-1"))
  await settleLoads(h)
  h.media[0].resolvePlay()
  h.media[0].emit("ended")

  assert.equal(await result.completion, SFX_COMPLETION.PLAYED)
  assert.equal(h.media[0].pauseCalls >= 1, true, "정리에서 매체를 멈추지 않았다")
  assert.equal(h.clock.pendingCount(), 0, "타이머가 남았다")
})

test("AC-06 로드 실패는 failed로 유한 정착한다", async () => {
  const h = makePlayer()
  const result = h.player.dispatch(gameEvent("lf-1"))
  h.loads[0].reject(new Error("network"))
  await flush()

  assert.equal(await result.completion, SFX_COMPLETION.FAILED)
  assert.equal(h.media.length, 0)
})

test("AC-06 영원히 정착하지 않는 로드는 3초 뒤 timed-out으로 끝난다", async () => {
  const h = makePlayer({ loadAsset: () => new Promise(() => {}) })
  const result = h.player.dispatch(gameEvent("hang-1"))

  h.clock.advance(3000)
  assert.equal(await result.completion, SFX_COMPLETION.TIMED_OUT)
  assert.equal(h.clock.pendingCount(), 0)
})

test("AC-06 Audio 생성이 던져도 failed로 정착하고 예외가 새지 않는다", async () => {
  const h = makePlayer({ createMedia: createMediaRecorder({ throwOnCreate: true }) })
  const result = h.player.dispatch(gameEvent("mc-1"))
  await settleLoads(h)
  assert.equal(await result.completion, SFX_COMPLETION.FAILED)
})

test("AC-06 play()가 던져도 failed로 정착한다", async () => {
  const h = makePlayer({ createMedia: createMediaRecorder({ playThrows: true }) })
  const result = h.player.dispatch(gameEvent("pt-1"))
  await settleLoads(h)
  assert.equal(await result.completion, SFX_COMPLETION.FAILED)
})

test("AC-06 자동재생 거절(play reject)은 failed로 끝나고 클릭 재시도를 등록하지 않는다", async () => {
  const h = makePlayer()
  const result = h.player.dispatch(gameEvent("ar-1"))
  await settleLoads(h)
  h.media[0].rejectPlay()
  await flush()

  assert.equal(await result.completion, SFX_COMPLETION.FAILED)
  assert.equal(h.player.dispatch(gameEvent("ar-1")).reason, SFX_SUPPRESSED_REASON.DUPLICATE)
  assert.equal(h.media.length, 1)
})

test("AC-06 play가 영원히 pending이고 ended도 오지 않으면 watchdog이 정리한다", async () => {
  const h = makePlayer({ createMedia: createMediaRecorder({ playMode: "pending" }) })
  const result = h.player.dispatch(gameEvent("wd-1"))
  await settleLoads(h)
  assert.equal(h.media.length, 1)

  h.clock.advance(1500)
  assert.equal(await result.completion, SFX_COMPLETION.TIMED_OUT)
  assert.equal(h.media[0].pauseCalls >= 1, true)
  assert.equal(h.clock.pendingCount(), 0)
})

test("AC-06 매체 error 이벤트는 failed로 정착한다", async () => {
  const h = makePlayer()
  const result = h.player.dispatch(gameEvent("err-1"))
  await settleLoads(h)
  h.media[0].emit("error")
  assert.equal(await result.completion, SFX_COMPLETION.FAILED)
})

test("AC-06 mix 구독자가 던져도 다른 구독자와 재생이 영향을 받지 않는다", async () => {
  const h = makePlayer()
  const seen = []
  h.player.subscribeMix(() => {
    throw new Error("listener boom")
  })
  h.player.subscribeMix((mix) => seen.push(mix))

  h.player.dispatch(gameEvent("sub-1"))
  await settleLoads(h)
  h.setSettings({ sfxVolume: 10 })

  assert.equal(seen.length, 1)
  assert.equal(h.media[0].volume, 0.1)
})

test("AC-06 잘못된 입력은 매체를 만들지 않고 억제 이유를 돌려준다", () => {
  const h = makePlayer()
  for (const bad of [null, undefined, 42, [], { kind: "test-game" }, { eventId: "x", origin: "live" }]) {
    const result = h.player.dispatch(bad)
    assert.equal(result.status, "suppressed")
    assert.equal(result.reason, SFX_SUPPRESSED_REASON.INVALID_EVENT)
  }
  assert.equal(h.player.dispatch(gameEvent("u-1", { kind: "no-such-kind" })).reason, SFX_SUPPRESSED_REASON.UNKNOWN_KIND)
  assert.equal(h.media.length, 0)
})

test("AC-06 dispatch는 completion을 기다리지 않고 동기로 돌아온다", () => {
  const h = makePlayer({ loadAsset: () => new Promise(() => {}) })
  const result = h.player.dispatch(gameEvent("sync-1"))
  assert.equal(result.status, "accepted")
  assert.ok(result.completion instanceof Promise)
})

test("AC-06 새 사건은 이전 활성 SFX를 stopped로 끝내고 자리를 넘겨받는다", async () => {
  const h = makePlayer()
  const first = h.player.dispatch(gameEvent("a-1", { kind: "test-account" }))
  await settleLoads(h, 0)
  const second = h.player.dispatch(gameEvent("a-2", { kind: "test-account" }))
  assert.equal(second.status, "accepted")

  assert.equal(await first.completion, SFX_COMPLETION.STOPPED)
  assert.equal(h.media[0].pauseCalls >= 1, true)
})


test("AC-02 unreviewed asset reason survives mute, zero volume and disabled notification", () => {
  for (const settings of [{sfxMuted:true},{masterVolume:0},{notifications:{"friend-invite":false}}]) {
    const h=makePlayer({settings,manifest:{
      "test-unreviewed": approvedEntry({reviewStatus:SFX_REVIEW_STATUS.NEEDS_REVIEW,sha256:null,src:null,notificationKey:"friend-invite"}),
    }})
    const result=h.player.dispatch({kind:"test-unreviewed",eventId:"unreviewed-settings",accountId:"acct-1",gameId:"game-1",origin:"live"})
    assert.equal(result.reason,"asset-unreviewed")
    assert.equal(h.player.getSilenceLog().at(-1).reason,"asset-unreviewed")
    assert.equal(h.loads.length,0)
    assert.equal(h.media.length,0)
    h.player.dispose()
  }
})


test("AC-03 rejected initial media volume never calls play", async () => {
  const factory=createMediaRecorder()
  const h=makePlayer({createMedia:src=>{
    const media=factory(src)
    Object.defineProperty(media,"volume",{get:()=>1,set:()=>{throw Error("volume rejected")}})
    return media
  }})
  const result=h.player.dispatch(gameEvent("locked-initial")); await settleLoads(h)
  assert.equal(await result.completion,SFX_COMPLETION.FAILED)
  assert.equal(factory.created[0].playCalls,0)
  assert.ok(factory.created[0].pauseCalls>=1)
  assert.equal(h.clock.pendingCount(),0)
})

test("AC-03 rejected mute during playback stops the active media", async () => {
  const h=makePlayer(); const result=h.player.dispatch(gameEvent("locked-playing"));await settleLoads(h)
  const media=h.media[0]
  Object.defineProperty(media,"muted",{get:()=>false,set:()=>{throw Error("mute rejected")}})
  h.setSettings({sfxMuted:true})
  assert.equal(await result.completion,SFX_COMPLETION.FAILED)
  assert.ok(media.pauseCalls>=1)
  assert.equal(media.volume,0)
  assert.equal(h.clock.pendingCount(),0)
})

test("AC-05 embedded claim owns one media and stops it on scope change/release/dispose",()=>{
  for(const boundary of ["scope","release","dispose"]){
    const h=makePlayer();const claim=h.player.claimAudio(gameEvent("claim-"+boundary),{mode:"embedded"})
    const media={volume:1,muted:false,pauses:0,pause(){this.pauses++}}
    const other={volume:1,muted:false}
    assert.equal(claim.attach(media),true)
    assert.equal(claim.attach(media),true)
    assert.equal(claim.attach(other),false)
    if(boundary==="scope")h.setScope({accountId:"another"})
    else if(boundary==="dispose")h.player.dispose()
    else claim.release()
    assert.ok(media.pauses>=1);assert.equal(media.muted,true);assert.equal(media.volume,0)
    assert.equal(claim.attach(other),false)
    h.setSettings({sfxVolume:10});assert.equal(other.volume,1)
    h.player.dispose()
  }
})

test("AC-05 a claim made before an account switch cannot attach later",()=>{
  const h=makePlayer();const claim=h.player.claimAudio(gameEvent("late-attach"),{mode:"embedded"})
  h.setScope({accountId:"next"})
  assert.equal(claim.attach({volume:1,muted:false}),false)
})

test("AC-06 load timer installation failure settles without starting the load",async()=>{
  const h=makePlayer({setTimer:()=>{throw Error("timer unavailable")}})
  const result=h.player.dispatch(gameEvent("timer-load"))
  assert.equal(await Promise.race([result.completion,Promise.resolve("unsettled")]),SFX_COMPLETION.FAILED)
  assert.equal(h.loads.length,0);assert.equal(h.media.length,0)
})

test("AC-06 playback watchdog installation failure settles before play",async()=>{
  let calls=0
  const h=makePlayer({setTimer:()=>{if(++calls===1)return 1;throw Error("watchdog unavailable")}})
  const result=h.player.dispatch(gameEvent("timer-play"));await settleLoads(h)
  assert.equal(await Promise.race([result.completion,Promise.resolve("unsettled")]),SFX_COMPLETION.FAILED)
  assert.equal(h.media[0].playCalls,0);assert.ok(h.media[0].pauseCalls>=1)
})

const accountEvent = (eventId, extra = {}) => ({
  kind: "test-account",
  eventId,
  accountId: "acct-1",
  origin: "live",
  ...extra,
})

test("F-17 배포 manifest의 system-notification은 계정 범위·시스템 알림 설정으로 등록돼 있다", () => {
  const entry = SFX_MANIFEST["system-notification"]
  assert.ok(entry, "F-17이 연결한 kind가 배포 manifest에 없다")
  assert.equal(entry.scope, SFX_SCOPE.ACCOUNT, "시스템 알림은 계정 전역 사건이다")
  assert.equal(entry.notificationKey, "system-notification")
  assert.equal(checkSfxAssetAllowed(entry).allowed, true, "2026-09-22부터 자작 합성 자산으로 승인됐다")
})

test("F-17 안정 알림 ID는 계정 범위에서 한 번만 처리되고 복원 봉투는 표식을 남기지 않는다", async () => {
  const h = makePlayer()

  const restored = h.player.dispatch(accountEvent("notification:n1", { origin: "restore" }))
  assert.equal(restored.reason, SFX_SUPPRESSED_REASON.RESTORE_ORIGIN)
  assert.equal(h.media.length, 0)

  const first = h.player.dispatch(accountEvent("notification:n1"))
  assert.equal(first.status, "accepted")
  await settleLoads(h)
  assert.equal(h.media.length, 1)

  assert.equal(h.player.dispatch(accountEvent("notification:n1")).reason, SFX_SUPPRESSED_REASON.DUPLICATE)
  assert.equal(h.media.length, 1)
})

test("F-17 시스템 알림 봉투는 계정 경계를 지키고 익명 범위에서는 아예 받지 않는다", () => {
  const h = makePlayer()

  assert.equal(
    h.player.dispatch(accountEvent("notification:n2", { accountId: "other-account" })).reason,
    SFX_SUPPRESSED_REASON.ACCOUNT_MISMATCH,
  )
  assert.equal(h.media.length, 0)

  h.setScope({ accountId: null })
  assert.equal(h.player.dispatch(accountEvent("notification:n2")).reason, SFX_SUPPRESSED_REASON.ANONYMOUS_SCOPE)
  assert.equal(h.media.length, 0)
})

test("F-17 알림 off로 억제된 사건도 표식을 소모해 설정을 다시 켜도 울리지 않는다", async () => {
  const h = makePlayer()
  const notified = (eventId) => ({
    kind: "test-notified",
    eventId,
    accountId: "acct-1",
    origin: "live",
  })

  assert.equal(h.player.dispatch(notified("notification:n3")).status, "accepted")
  await settleLoads(h)
  assert.equal(h.media.length, 1)

  h.setSettings({ notifications: { "friend-invite": false } })
  assert.equal(
    h.player.dispatch(notified("notification:n4")).reason,
    SFX_SUPPRESSED_REASON.NOTIFICATION_DISABLED,
  )

  h.setSettings({ notifications: { "friend-invite": true } })
  assert.equal(
    h.player.dispatch(notified("notification:n4")).reason,
    SFX_SUPPRESSED_REASON.DUPLICATE,
    "설정을 다시 켰다고 과거 사건이 새 사건이 되면 안 된다",
  )
  assert.equal(h.media.length, 1)
})

test("F-17 시스템 알림의 로드가 영원히 정착하지 않아도 completion은 유한 시간에 끝난다", async () => {
  const h = makePlayer({ loadAsset: () => new Promise(() => {}) })
  const result = h.player.dispatch(accountEvent("notification:pending"))
  assert.equal(result.status, "accepted")

  h.clock.advance(SFX_LOAD_TIMEOUT_MS + 1)
  await flush()
  assert.equal(
    await Promise.race([result.completion, Promise.resolve("unsettled")]),
    SFX_COMPLETION.TIMED_OUT,
  )
  assert.equal(h.media.length, 0)
})
