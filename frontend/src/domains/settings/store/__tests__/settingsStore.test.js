import test from "node:test"
import assert from "node:assert/strict"
import { JSDOM } from "jsdom"

// persist가 localStorage에 실제로 쓰는지/복원하는지 검증하려면 진짜 localStorage 전역이
// 필요하다 — 설치 방식은 기존 훅 시험(useSoundSettings.test.js)과 동일하다.
const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
})

function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}

installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("localStorage", dom.window.localStorage)

const STORE_URL = new URL("../settingsStore.js", import.meta.url).href

/** 모듈을 새로 평가해 "새로고침 뒤 처음 store를 만드는 시점"을 흉내낸다 — 같은
 *  localStorage를 공유하는 완전히 새 zustand store 인스턴스를 얻는다. */
async function freshSettingsModule() {
  return import(`${STORE_URL}?case=${Math.random()}`)
}

const {
  useSettingsStore,
  buildDefaultSoundVolumes,
  buildDefaultGeneralChecks,
  CHAT_TEXT_SIZE_STORAGE_RANGE,
  sanitizePersistedVolumes,
  clampPersistedNumber,
} = await freshSettingsModule()
const { INGAME_SETTING_CHAT_SLIDER } = await import(
  "../../../game/ingame/constants/controls/ingameSetting/ingameSettingData.js"
)
const { SOUND_SETTING_VOLUMES } = await import("../../constants/soundSettings.js")
const { GENERAL_SETTING_CHECKBOXES, GENERAL_SETTING_TEXT_SIZE } = await import(
  "../../constants/generalSettings.js"
)

test.beforeEach(() => {
  localStorage.clear()
  useSettingsStore.setState({
    volumes: buildDefaultSoundVolumes(),
    generalChecks: buildDefaultGeneralChecks(),
    generalTextSize: GENERAL_SETTING_TEXT_SIZE.defaultValue,
    chatChecks: null,
    chatTextSize: null,
    inGameSettingTab: null,
  })
})

test("F-15(AC-01): 일반 체크 기본값은 fullscreen·whisper를 뺀 나머지 항목만 담는다", () => {
  const defaults = buildDefaultGeneralChecks()

  assert.equal("fullscreen" in defaults, false)
  assert.equal("whisper" in defaults, false)
  for (const { id, defaultChecked } of GENERAL_SETTING_CHECKBOXES) {
    if (id === "fullscreen" || id === "whisper") continue
    assert.equal(defaults[id], defaultChecked)
  }
})

test("F-15(AC-06): setGeneralCheck·setGeneralTextSize·setVolume은 localStorage에 반영된다", () => {
  useSettingsStore.getState().setGeneralCheck("friend-invite", false)
  useSettingsStore.getState().setGeneralTextSize(5)
  useSettingsStore.getState().setVolume(SOUND_SETTING_VOLUMES[0].id, 10)

  const raw = localStorage.getItem("settings-storage")
  assert.ok(raw, "localStorage에 저장된 값이 있어야 한다")
  const saved = JSON.parse(raw).state

  assert.equal(saved.generalChecks["friend-invite"], false)
  assert.equal(saved.generalTextSize, 5)
  assert.equal(saved.volumes[SOUND_SETTING_VOLUMES[0].id], 10)
})

test("F-15(AC-06): 새로고침 후(새 store 인스턴스) 저장된 값을 복원한다", async () => {
  useSettingsStore.getState().setGeneralCheck("game-invite", false)
  useSettingsStore.getState().setGeneralTextSize(1)
  useSettingsStore.getState().setChatCheck("show-time", true)
  useSettingsStore.getState().setChatTextSize(42)

  // 짧은 대기로 persist의 비동기 저장이 끝나길 기다린다.
  await new Promise((resolve) => setTimeout(resolve, 0))

  const restored = await freshSettingsModule()
  await new Promise((resolve) => setTimeout(resolve, 0))
  const state = restored.useSettingsStore.getState()

  assert.equal(state.generalChecks["game-invite"], false)
  assert.equal(state.generalTextSize, 1)
  assert.equal(state.chatChecks["show-time"], true)
  assert.equal(state.chatTextSize, 42)
})

test("F-15(AC-06): 손상된 localStorage 값은 무시하고 기본값으로 대체한다(오류를 던지지 않음)", async () => {
  localStorage.setItem("settings-storage", "{이건 유효한 JSON이 아님")

  const restored = await freshSettingsModule()
  const state = restored.useSettingsStore.getState()

  assert.deepEqual(state.generalChecks, buildDefaultGeneralChecks())
  assert.equal(state.generalTextSize, GENERAL_SETTING_TEXT_SIZE.defaultValue)
})

test("F-15(AC-06): 범위를 벗어나거나 잘못된 타입의 값은 검증 후 현재 값으로 대체한다", async () => {
  localStorage.setItem(
    "settings-storage",
    JSON.stringify({
      state: {
        generalTextSize: 9999,
        generalChecks: "이건 객체가 아님",
        chatChecks: { "nickname-color": "참" },
      },
      version: 0,
    }),
  )

  const restored = await freshSettingsModule()
  const state = restored.useSettingsStore.getState()

  assert.ok(
    state.generalTextSize <= GENERAL_SETTING_TEXT_SIZE.max,
    "범위를 벗어난 텍스트 크기는 최댓값 이하로 보정되어야 한다",
  )
  assert.deepEqual(state.generalChecks, buildDefaultGeneralChecks())
  assert.deepEqual(state.chatChecks, {}, "boolean이 아닌 값은 걸러내야 한다")
})

// F-15(AC-06): 볼륨은 슬라이더 정의(SOUND_SETTING_VOLUMES)의 타입·범위를 지켜야 한다 —
// 손상된 값이 그대로 복원되면 슬라이더·사운드 경로에 범위 밖 값이 흘러든다.
test("F-15(AC-06): 저장된 볼륨의 타입·범위를 검증한다(범위 밖은 보정, 잘못된 타입·모르는 id는 버림)", async () => {
  const [first, second, third] = SOUND_SETTING_VOLUMES

  localStorage.setItem(
    "settings-storage",
    JSON.stringify({
      state: {
        volumes: {
          [first.id]: first.max + 500,
          [second.id]: second.min - 500,
          [third.id]: "시끄럽게",
          "unknown-volume": 42,
        },
      },
      version: 0,
    }),
  )

  const restored = await freshSettingsModule()
  const { volumes } = restored.useSettingsStore.getState()

  assert.equal(volumes[first.id], first.max, "최댓값을 넘으면 최댓값으로 보정한다")
  assert.equal(volumes[second.id], second.min, "최솟값 미만이면 최솟값으로 보정한다")
  assert.equal(volumes[third.id], third.defaultValue, "숫자가 아니면 기본값을 유지한다")
  assert.equal("unknown-volume" in volumes, false, "정의에 없는 id는 저장 대상이 아니다")
})

test("F-15(AC-06): 볼륨 맵 자체가 객체가 아니면 기본 볼륨을 유지한다", async () => {
  localStorage.setItem(
    "settings-storage",
    JSON.stringify({ state: { volumes: "이건 객체가 아님" }, version: 0 }),
  )

  const restored = await freshSettingsModule()

  assert.deepEqual(restored.useSettingsStore.getState().volumes, buildDefaultSoundVolumes())
})

test("F-15(AC-06): 저장된 채팅 글자 크기도 범위를 벗어나면 보정하고, 숫자가 아니면 버린다", async () => {
  localStorage.setItem(
    "settings-storage",
    JSON.stringify({ state: { chatTextSize: 100000 }, version: 0 }),
  )
  const tooLarge = await freshSettingsModule()
  assert.equal(
    tooLarge.useSettingsStore.getState().chatTextSize,
    CHAT_TEXT_SIZE_STORAGE_RANGE.max,
  )

  localStorage.setItem(
    "settings-storage",
    JSON.stringify({ state: { chatTextSize: -40 }, version: 0 }),
  )
  const tooSmall = await freshSettingsModule()
  assert.equal(
    tooSmall.useSettingsStore.getState().chatTextSize,
    CHAT_TEXT_SIZE_STORAGE_RANGE.min,
  )

  localStorage.setItem(
    "settings-storage",
    JSON.stringify({ state: { chatTextSize: "크게" }, version: 0 }),
  )
  const notANumber = await freshSettingsModule()
  assert.equal(
    notANumber.useSettingsStore.getState().chatTextSize,
    null,
    "숫자가 아니면 '아직 고른 적 없음'(null)을 유지한다",
  )
})

// F-15(AC-06) 반송 수정: 이전 구현은 Number(value) 변환으로 타입을 검증했다. Number(null),
// Number(""), Number("   "), Number([]) 는 모두 0이고 Number([50]) 은 50이라, 손상된 값이
// "유효한 숫자"로 통과해 볼륨이 0으로 떨어지거나 엉뚱한 값으로 바뀌었다. 아래 두 시험은
// 그 결함을 직접 재현한다(수정 전에는 실패한다).
const INVALID_PERSISTED_NUMBERS = [
  ["null", null],
  ["빈 문자열", ""],
  ["공백 문자열", "   "],
  ["숫자 문자열", "50"],
  ["빈 배열", []],
  ["숫자 하나가 든 배열", [50]],
  ["true", true],
  ["false", false],
  ["객체", { value: 50 }],
  ["NaN", Number.NaN],
  ["Infinity", Number.POSITIVE_INFINITY],
  ["-Infinity", Number.NEGATIVE_INFINITY],
]

test("F-15(AC-06): 숫자가 아닌 저장값은 현재 볼륨을 그대로 유지한다(0으로 강제 변환하지 않음)", () => {
  const [first] = SOUND_SETTING_VOLUMES
  const current = { ...buildDefaultSoundVolumes(), [first.id]: 7 }

  for (const [label, invalid] of INVALID_PERSISTED_NUMBERS) {
    const next = sanitizePersistedVolumes({ [first.id]: invalid }, current)

    assert.equal(
      next[first.id],
      7,
      `${label}: 잘못된 타입은 현재 볼륨(7)을 유지해야 한다 — 받은 값 ${next[first.id]}`,
    )
  }
})

test("F-15(AC-06): 볼륨 맵이 배열이면 통째로 버리고, 현재값이 손상됐으면 정의된 기본값을 쓴다", () => {
  const [first] = SOUND_SETTING_VOLUMES

  assert.deepEqual(
    sanitizePersistedVolumes([], buildDefaultSoundVolumes()),
    buildDefaultSoundVolumes(),
  )
  assert.deepEqual(
    sanitizePersistedVolumes([{ [first.id]: 1 }], buildDefaultSoundVolumes()),
    buildDefaultSoundVolumes(),
  )
  // 현재 상태 쪽이 손상된 경우에도 0이 아니라 슬라이더 정의의 기본값으로 되돌린다.
  assert.deepEqual(
    sanitizePersistedVolumes({}, { [first.id]: null }),
    buildDefaultSoundVolumes(),
  )
})

test("F-15(AC-06): 유효한 유한 숫자는 여전히 각 슬라이더의 min·max로 보정한다", () => {
  const current = buildDefaultSoundVolumes()

  for (const { id, min, max } of SOUND_SETTING_VOLUMES) {
    const clampedHigh = sanitizePersistedVolumes({ [id]: max + 1 }, current)
    const clampedLow = sanitizePersistedVolumes({ [id]: min - 1 }, current)
    const kept = sanitizePersistedVolumes({ [id]: min }, current)

    assert.equal(clampedHigh[id], max)
    assert.equal(clampedLow[id], min)
    assert.equal(kept[id], min, "범위 안의 값은 그대로 둔다")
  }
})

test("F-15(AC-06): 복원한 숫자 설정 전체가 같은 타입 검증을 쓴다(Number 변환 금지)", () => {
  for (const [label, invalid] of INVALID_PERSISTED_NUMBERS) {
    assert.equal(
      clampPersistedNumber(invalid, { min: 1, max: 5, fallback: 3 }),
      3,
      `${label}: 잘못된 타입이면 fallback을 그대로 써야 한다`,
    )
  }

  assert.equal(clampPersistedNumber(9, { min: 1, max: 5, fallback: 3 }), 5)
  assert.equal(clampPersistedNumber(-9, { min: 1, max: 5, fallback: 3 }), 1)
  assert.equal(clampPersistedNumber(2, { min: 1, max: 5, fallback: 3 }), 2)
  assert.equal(clampPersistedNumber(0, { min: 0, max: 5, fallback: 3 }), 0, "0은 유효한 값이다")
})

test("F-15(AC-06): 저장된 텍스트 크기·채팅 크기가 null·빈 문자열·배열이면 현재 값을 유지한다", async () => {
  for (const invalid of [null, "", "   ", [], [2], true, { value: 2 }]) {
    localStorage.setItem(
      "settings-storage",
      JSON.stringify({
        state: { generalTextSize: invalid, chatTextSize: invalid },
        version: 0,
      }),
    )

    const restored = await freshSettingsModule()
    const state = restored.useSettingsStore.getState()

    assert.equal(
      state.generalTextSize,
      GENERAL_SETTING_TEXT_SIZE.defaultValue,
      `${JSON.stringify(invalid)}: 텍스트 크기는 기본값을 유지해야 한다`,
    )
    assert.equal(
      state.chatTextSize,
      null,
      `${JSON.stringify(invalid)}: 채팅 크기는 '아직 고른 적 없음'을 유지해야 한다`,
    )
  }
})

test("F-15(AC-06): JSON이 Infinity로 파싱되는 값(1e999)도 유효한 숫자로 받지 않는다", async () => {
  const [first] = SOUND_SETTING_VOLUMES

  // JSON.parse는 1e999를 Infinity로 만든다 — 실제 복원 경로에서 무한값을 재현할 수 있는
  // 유일한 방법이라 손으로 만든 raw JSON을 쓴다.
  localStorage.setItem(
    "settings-storage",
    `{"state":{"volumes":{"${first.id}":1e999},"generalTextSize":1e999},"version":0}`,
  )

  const restored = await freshSettingsModule()
  const state = restored.useSettingsStore.getState()

  assert.equal(state.volumes[first.id], first.defaultValue)
  assert.equal(state.generalTextSize, GENERAL_SETTING_TEXT_SIZE.defaultValue)
})

test("F-15(AC-06): null 볼륨이 저장돼 있어도 0이 아니라 정의된 기본값으로 복원한다", async () => {
  const [first, second] = SOUND_SETTING_VOLUMES

  localStorage.setItem(
    "settings-storage",
    JSON.stringify({
      state: { volumes: { [first.id]: null, [second.id]: [second.max] } },
      version: 0,
    }),
  )

  const restored = await freshSettingsModule()
  const { volumes } = restored.useSettingsStore.getState()

  assert.equal(volumes[first.id], first.defaultValue, "null이 0으로 변환되면 무음이 된다")
  assert.equal(volumes[second.id], second.defaultValue, "배열이 숫자로 변환되면 안 된다")
})

test("F-15(AC-06): 채팅 글자 크기 저장 범위는 실제 인게임 슬라이더 정의와 같다", () => {
  assert.equal(CHAT_TEXT_SIZE_STORAGE_RANGE.min, INGAME_SETTING_CHAT_SLIDER.min)
  assert.equal(CHAT_TEXT_SIZE_STORAGE_RANGE.max, INGAME_SETTING_CHAT_SLIDER.max)
})

// F-15(AC-06): 기기 저장이 실패(용량 초과·프라이빗 모드)해도 화면은 계속 동작하되,
// 저장에 성공한 것처럼 두지 않는다.
test("F-15(AC-06): localStorage 쓰기가 실패하면 던지지 않되 실패를 기록한다(성공으로 표시하지 않음)", async () => {
  const fresh = await freshSettingsModule()
  fresh.clearSettingsStorageWriteError()

  // jsdom의 Storage는 setItem을 직접 덮어써도 반영되지 않는 경우가 있어, 전역 자체를
  // "쓰기만 실패하는" 대역으로 바꾼다(읽기·삭제는 실제 저장소로 위임).
  const realLocalStorage = globalThis.localStorage
  const originalWarn = console.warn
  console.warn = () => {}
  installDomGlobal("localStorage", {
    getItem: (key) => realLocalStorage.getItem(key),
    removeItem: (key) => realLocalStorage.removeItem(key),
    setItem: () => {
      throw new DOMException("할당량 초과", "QuotaExceededError")
    },
  })

  try {
    fresh.useSettingsStore.getState().setGeneralTextSize(GENERAL_SETTING_TEXT_SIZE.max)
    await new Promise((resolve) => setTimeout(resolve, 0))

    // 저장은 실패했지만 이번 세션 상태는 그대로 쓸 수 있어야 한다.
    assert.equal(
      fresh.useSettingsStore.getState().generalTextSize,
      GENERAL_SETTING_TEXT_SIZE.max,
    )
    assert.notEqual(
      fresh.getSettingsStorageWriteError(),
      null,
      "쓰기 실패를 삼키면 저장된 것처럼 보인다",
    )
  } finally {
    installDomGlobal("localStorage", realLocalStorage)
    console.warn = originalWarn
  }

  // 다시 쓰기에 성공하면 실패 기록이 지워진다.
  fresh.useSettingsStore.getState().setGeneralTextSize(GENERAL_SETTING_TEXT_SIZE.defaultValue)
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(fresh.getSettingsStorageWriteError(), null)
})

test("F-15(AC-02/AC-05): resetSettings는 volumes·generalChecks·generalTextSize·chatChecks·chatTextSize만 기본값으로 되돌린다", () => {
  useSettingsStore.getState().setGeneralCheck("friend-invite", false)
  useSettingsStore.getState().setGeneralTextSize(1)
  useSettingsStore.getState().setChatCheck("nickname-color", true)
  useSettingsStore.getState().setChatTextSize(10)
  useSettingsStore.getState().setVolume(SOUND_SETTING_VOLUMES[0].id, 3)
  useSettingsStore.getState().setInGameSettingTab("sound")

  useSettingsStore.getState().resetSettings()

  const state = useSettingsStore.getState()
  assert.deepEqual(state.volumes, buildDefaultSoundVolumes())
  assert.deepEqual(state.generalChecks, buildDefaultGeneralChecks())
  assert.equal(state.generalTextSize, GENERAL_SETTING_TEXT_SIZE.defaultValue)
  assert.equal(state.chatChecks, null)
  assert.equal(state.chatTextSize, null)
  // 화면 탐색 상태(현재 열린 인게임 설정 탭)는 환경설정이 아니므로 초기화 대상이 아니다.
  assert.equal(state.inGameSettingTab, "sound")
})

test("F-15(AC-05): resetSettings는 음악 재생 차단 정책(MUSIC_PLAYBACK_ENABLED)과 무관한 필드만 다룬다", async () => {
  const { MUSIC_PLAYBACK_ENABLED } = await import("../../../../shared/constants/bgmAssets.js")

  assert.equal(MUSIC_PLAYBACK_ENABLED, false, "음악 차단 정책은 이 슬라이스가 바꾸지 않는다")

  const beforeKeys = Object.keys(useSettingsStore.getState())
  useSettingsStore.getState().resetSettings()
  const afterKeys = Object.keys(useSettingsStore.getState())

  assert.deepEqual(afterKeys.sort(), beforeKeys.sort(), "resetSettings는 새 필드를 만들거나 지우지 않는다")
})
