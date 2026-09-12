import test from "node:test"
import assert from "node:assert/strict"
import { JSDOM } from "jsdom"

// ---------------------------------------------------------------------------
// F-16 공통 효과음 재생기 계약 시험.
//
// 재생기는 DOM·store·소켓을 모르고 전부 주입받으므로, 이 파일은 **실제 production 재생기
// 코드**를 그대로 돌린다(핸들러를 복제하거나 소스를 정규식으로 훑지 않는다). 시계·타이머·
// 로더·매체만 시험이 소유해서 비동기 실패를 결정적으로 재현한다.
//
// 중요(AC-02): 아래 "정상 재생" 시험들은 시험 전용 fixture manifest를 쓴다. fixture와 가짜
// 매체는 **배포용 자산 검토도, 실제 청음도 아니다.** 실제 배포 manifest(SFX_MANIFEST)는
// 자산이 하나도 제공되지 않아 전 항목이 무음이며, 그 사실 자체를 아래에서 따로 검사한다.
// ---------------------------------------------------------------------------

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { pretendToBeVisual: true })

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

const { createSfxPlayer, SFX_COMPLETION } = await import("../sfxPlayer.js")
const {
  SFX_MANIFEST,
  SFX_REVIEW_STATUS,
  SFX_CLASSIFICATION,
  SFX_SUPPRESSED_REASON,
  SFX_SCOPE,
  MAX_SEPARATE_SFX_DURATION_MS,
  checkSfxAssetAllowed,
  listSilencedSfxKinds,
} = await import("../sfxManifest.js")
const { useSettingsStore, buildDefaultSoundVolumes, SFX_MUTED_DEFAULT } = await import(
  "../../../domains/settings/store/settingsStore.js"
)

// ---------------------------------------------------------------------------
// 시험 장비
// ---------------------------------------------------------------------------

const GOOD_HASH = "sha256-fixture-ok"

/** 검토를 통과한 것으로 취급하는 fixture 자산(시험 전용). */
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

/** 수동으로 굴리는 타이머. 실제 시간에 의존하지 않고 3초 제한·watchdog을 정확히 재현한다. */
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
    /** ms만큼 시간을 진행시키며 그 사이 만기된 타이머를 순서대로 실행한다. */
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

/** 실제 Audio 대신 쓰는 기록용 매체. 시험이 ended/error/reject를 직접 일으킨다. */
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
    // 아무도 reject를 잡지 않는 unhandled rejection을 막는다(시험 러너 보호).
    playPromise.catch(() => {})
    created.push(media)
    return media
  }
  factory.created = created
  return factory
}

const DEFAULT_SETTINGS = { masterVolume: 100, sfxVolume: 80, sfxMuted: false, notifications: {} }

/** 재생기 하나와 그것을 조종하는 손잡이들을 함께 만든다. */
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
    setTimer: clock.setTimer,
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

/** 대기 중인 로드를 성공시키고, 뒤이은 promise 체인이 전부 돌 때까지 기다린다. */
async function settleLoads(harness, index = 0) {
  harness.loads[index]?.resolve({ sha256: GOOD_HASH, src: "/fixture/ok.wav" })
  await flush()
}

async function flush() {
  for (let i = 0; i < 8; i += 1) await Promise.resolve()
}

// ---------------------------------------------------------------------------
// AC-02 · 실제 배포 manifest는 자산이 없으므로 전부 무음이다
// ---------------------------------------------------------------------------

test("AC-02 배포 manifest의 모든 항목은 아직 미검토이고 경로·해시를 지어내지 않는다", () => {
  const kinds = Object.keys(SFX_MANIFEST)
  assert.ok(kinds.length > 0)
  for (const kind of kinds) {
    const entry = SFX_MANIFEST[kind]
    assert.equal(entry.reviewStatus, SFX_REVIEW_STATUS.NEEDS_REVIEW, `${kind}가 승인 상태로 바뀌었다`)
    assert.equal(entry.src, null, `${kind}에 존재하지 않는 경로가 생겼다`)
    assert.equal(entry.sha256, null, `${kind}에 지어낸 해시가 생겼다`)
    assert.equal(typeof entry.silenceReason, "string")
    assert.equal(checkSfxAssetAllowed(entry).allowed, false)
  }
  // 무음 목록이 실제 manifest에서 파생된다 — 문서 사본이 아니다.
  assert.equal(listSilencedSfxKinds().length, kinds.length)
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

// ---------------------------------------------------------------------------
// AC-03 · Master × SFX 볼륨과 음소거
// ---------------------------------------------------------------------------

test("AC-03 gain은 Master × SFX의 곱이고 음소거면 유효 gain이 0이다", () => {
  const h = makePlayer({ settings: { masterVolume: 50, sfxVolume: 40 } })
  assert.equal(h.player.getMix().gain, 0.2)
  assert.equal(h.player.getMix().muted, false)

  h.setSettings({ sfxMuted: true })
  assert.deepEqual(h.player.getMix(), { gain: 0, muted: true })

  // 음소거 중 볼륨을 바꿔도 음소거는 유지된다.
  h.setSettings({ masterVolume: 100, sfxVolume: 100 })
  assert.deepEqual(h.player.getMix(), { gain: 0, muted: true })

  // 해제하면 그때의 최신 곱이 적용된다.
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

  // 비boolean은 상태를 오염시키지 않는다.
  useSettingsStore.getState().setSfxMuted("true")
  assert.equal(useSettingsStore.getState().sfxMuted, true)
  useSettingsStore.getState().setSfxMuted(null)
  assert.equal(useSettingsStore.getState().sfxMuted, true)

  useSettingsStore.getState().resetSettings()
  assert.equal(useSettingsStore.getState().sfxMuted, SFX_MUTED_DEFAULT)
  assert.deepEqual(useSettingsStore.getState().volumes, buildDefaultSoundVolumes())

  // 저장 대상에 실제로 들어간다 — 새로고침 후 복원의 근거다.
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

// ---------------------------------------------------------------------------
// AC-04 · 중복·복원·범위
// ---------------------------------------------------------------------------

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

  // 같은 사건이 나중에 실제 live로 오면 그때가 최초다.
  assert.equal(h.player.dispatch(gameEvent("r-1")).status, "accepted")
})

test("AC-04 mute/알림 off로 억제된 유효 사건은 설정을 켜도 다시 재생되지 않는다", () => {
  const h = makePlayer({ settings: { sfxMuted: true } })
  assert.equal(h.player.dispatch(gameEvent("late-1")).reason, SFX_SUPPRESSED_REASON.MUTED)

  h.setSettings({ sfxMuted: false })
  assert.equal(h.player.dispatch(gameEvent("late-1")).reason, SFX_SUPPRESSED_REASON.DUPLICATE)
  assert.equal(h.media.length, 0)

  // 새로운 사건만 대상이 된다.
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
  // 종료된 범위(game-1)의 사건은 이후 범위 검사에서 거부된다.
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

// ---------------------------------------------------------------------------
// AC-05 · 수신자 범위와 내장음 소유권
// ---------------------------------------------------------------------------

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

  // 익명 UI는 별도 런타임 범위를 쓴다 — 계정이 없다고 거부하지 않는다.
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
  // 길이가 제한을 넘는 사건도 embedded claim 자체는 성립한다(승인 MOV는 4~5초다).
  const claim = h.player.claimAudio(gameEvent("mov-long", { kind: "test-too-long" }), { mode: "embedded" })
  assert.equal(claim.status, "claimed")
  // 같은 사건의 별도 재생은 여전히 막힌다.
  assert.equal(h.player.dispatch(gameEvent("mov-long", { kind: "test-too-long" })).reason, SFX_SUPPRESSED_REASON.DUPLICATE)
})

// ---------------------------------------------------------------------------
// AC-06 · 실패 격리와 유한 정착
// ---------------------------------------------------------------------------

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
  // 다음 클릭으로 재시도하지 않는다 — 같은 사건은 이미 처리 표식이 선점돼 있다.
  assert.equal(h.player.dispatch(gameEvent("ar-1")).reason, SFX_SUPPRESSED_REASON.DUPLICATE)
  assert.equal(h.media.length, 1)
})

test("AC-06 play가 영원히 pending이고 ended도 오지 않으면 watchdog이 정리한다", async () => {
  const h = makePlayer({ createMedia: createMediaRecorder({ playMode: "pending" }) })
  const result = h.player.dispatch(gameEvent("wd-1"))
  await settleLoads(h)
  assert.equal(h.media.length, 1)

  // 검토 길이(500ms) + watchdog(1000ms)
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
  // 로드가 영원히 pending인데도 호출은 이미 끝나 있다.
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
