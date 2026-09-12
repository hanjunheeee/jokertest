import assert from "node:assert/strict"
import test, { mock } from "node:test"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { register } from "node:module"
import { JSDOM } from "jsdom"
import React from "react"

// F-15(AC-02) 반송 수정: 이전 라운드는 "설정 화면의 라벨·제목"과 index.css 소스 검사만
// 근거로 냈다. 이 시험은 설정 화면이 아닌 실제 화면 컴포넌트를 그대로 마운트해서, 설정
// 입력 → store → App의 CSS 변수 → 렌더된 텍스트까지 실제 생산 경로가 이어지는지 확인한다.
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
})

function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}

installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("localStorage", dom.window.localStorage)
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))
globalThis.IS_REACT_ACT_ENVIRONMENT = true

// FriendListRow → useFriendStore → friend.api.js → shared/api/client.js → shared/env.js가
// import.meta.env(Vite 빌드타임 치환)를 읽는다 — Node 러너에는 그 값이 없어 import 자체가
// 터진다. 이 저장소의 기존 관례(profileEquipment.publicDisplay.test.js·client.test.js)대로
// 외부 환경값을 담은 env.js 하나만 갈아끼우고, 확인 대상인 컴포넌트·store·훅·CSS는 전부
// 실제 코드 그대로 쓴다(이 시험은 네트워크를 호출하지 않는다).
mock.module("../../shared/env.js", {
  namedExports: { API_BASE_URL: "http://test-api.local", DISCORD_SUPPORT_URL: undefined },
})

register(
  new URL("../../domains/game/ingame/__tests__/testSupport/jsxNodeLoaderHooks.mjs", import.meta.url),
)

const { render, cleanup, act, fireEvent } = await import("@testing-library/react")
test.afterEach(() => cleanup())

const { useAppTextScaleSync } = await import("../useAppTextScaleSync.js")
const { APP_TEXT_SCALE_CSS_VAR, getAppTextScale } = await import("../appTextScale.js")
const { useSettingsStore } = await import("../../domains/settings/store/settingsStore.js")
const { GENERAL_SETTING_TEXT_SIZE } = await import(
  "../../domains/settings/constants/generalSettings.js"
)

// 설정 화면이 아닌 실제 소비자들 — 로비 친구 목록 행, 명예의 전당 헤더, 공용 슬라이더·드롭다운.
const { default: FriendListRow } = await import(
  "../../domains/lobby/components/friendList/list/FriendListRow.jsx"
)
const { default: PodiumHeader } = await import("../../domains/podium/components/PodiumHeader.jsx")
const { default: RangeSlider } = await import("../../shared/ui/RangeSlider.jsx")
const { default: Dropdown } = await import("../../shared/ui/Dropdown.jsx")
const { default: GeneralSettingsTab } = await import(
  "../../domains/settings/components/tabs/GeneralSettingsTab.jsx"
)

const SRC_ROOT = fileURLToPath(new URL("../../", import.meta.url))

function appTextSizeValue(className) {
  const match = className.match(/\[--app-text-size:([^\]]+)\]/)
  assert.notEqual(match, null, `--app-text-size 선언이 없습니다: ${className}`)
  return match[1]
}

/** 렌더된 요소가 공용 배율 유틸리티를 쓰고, 원래 크기 값을 한 글자도 바꾸지 않았는지. */
function assertScaledConsumer(element, originalFontSize, label) {
  const classNames = element.className.split(/\s+/)

  assert.ok(
    classNames.includes("app-text-scaled"),
    `${label}: app-text-scaled가 없으면 설정을 바꿔도 크기가 변하지 않는다 — ${element.className}`,
  )
  assert.equal(
    element.className.match(/(?:^|\s)text-\[(?:clamp\(|[0-9.]+(?:rem|px|em|vw|vh|vmin|vmax|cqi|cqw|cqh|cqb|cqmin|cqmax)\])/),
    null,
    `${label}: 배율 없는 기본 font-size 유틸리티가 남아 있으면 배율이 무시된다`,
  )
  assert.equal(
    appTextSizeValue(element.className),
    originalFontSize,
    `${label}: 원래 크기 값이 보존되어야 기본 배율에서 기존 화면과 같다`,
  )
  assert.equal(element.style.fontSize, "", `${label}: 인라인 font-size로 덮어쓰면 안 된다`)
}

/**
 * 클래스와 설정 배율에서 예상 px 값을 계산한다. 실제 CSS 계산값 검증이 아니다.
 *
 * .app-text-scaled는 font-size: calc(var(--app-text-size) * var(--app-text-scale, 1))이므로,
 * 요소가 실제로 달고 있는 --app-text-size와 App이 documentElement에 써 넣은 배율을 읽어
 * 곱하면 브라우저가 계산할 값과 같다(px 단위 항에 대해). jsdom은 clamp()·cqi를 계산하지
 * 않으므로 px 단위 소비자로 확인하고, clamp 소비자는 배율이 곱해지는 형태까지만 본다 —
 * 실제 픽셀 확인은 operator의 Chrome 검증 몫이다.
 */
function expectedFontSizePxFromWiring(element) {
  const declared = appTextSizeValue(element.className)
  const match = declared.match(/^([0-9.]+)px$/)
  assert.notEqual(match, null, `px 단위 소비자만 계산할 수 있다: ${declared}`)

  const scaleText = document.documentElement.style.getPropertyValue(APP_TEXT_SCALE_CSS_VAR)
  assert.notEqual(scaleText, "", "App이 --app-text-scale을 반영하지 않았다")

  return Number(match[1]) * Number(scaleText)
}

/** App.jsx와 같은 훅으로 배율을 반영하면서 실제 소비자들을 함께 마운트한다. */
function ScaleHarness() {
  useAppTextScaleSync()

  return React.createElement(
    "div",
    null,
    React.createElement(PodiumHeader),
    React.createElement(FriendListRow, { id: "f1", name: "친구하나", online: false }),
    React.createElement(RangeSlider, {
      value: 3,
      min: 1,
      max: 5,
      onChange: () => {},
      ariaLabel: "예시 슬라이더",
    }),
    React.createElement(Dropdown, { value: "선택값", inputFieldSrc: "/x.png" }),
    // 설정 입력(실제 "텍스트 크기" 슬라이더)도 같은 트리에 둔다 — 입력부터 소비자까지
    // 한 번의 마운트 안에서 이어지는지 확인하기 위해서다.
    React.createElement(GeneralSettingsTab),
  )
}

function setTextSize(container, value) {
  const slider = container.querySelector(`input[aria-label="${GENERAL_SETTING_TEXT_SIZE.label}"]`)
  assert.notEqual(slider, null, "설정 화면의 텍스트 크기 슬라이더를 찾지 못했다")
  act(() => {
    fireEvent.change(slider, { target: { value: String(value) } })
  })
}

test.beforeEach(() => {
  localStorage.clear()
  document.documentElement.style.removeProperty(APP_TEXT_SCALE_CSS_VAR)
  useSettingsStore.setState({ generalTextSize: GENERAL_SETTING_TEXT_SIZE.defaultValue })
})

test("F-15(AC-02): 설정 화면이 아닌 실제 소비자들이 공용 배율 유틸리티로 원래 크기를 싣는다", () => {
  const { getByText, container } = render(React.createElement(ScaleHarness))

  assertScaledConsumer(getByText("명예의 전당"), "clamp(1.18rem,1.72vw,1.45rem)", "명예의 전당 제목")
  assertScaledConsumer(getByText("친구하나"), "clamp(0.8rem,1.05vw,0.95rem)", "친구 목록 이름")
  assertScaledConsumer(getByText("오프라인"), "10px", "친구 접속 상태")
  assertScaledConsumer(getByText("선택값").parentElement, "clamp(0.98rem,1.35vw,1.08rem)", "드롭다운 값")
  assertScaledConsumer(
    container.querySelector('p[aria-live="polite"]'),
    "clamp(1.22rem,1.75vw,1.42rem)",
    "슬라이더 숫자",
  )
})

test("F-15(AC-02): 텍스트 크기를 최소·기본·최대로 바꾸면 렌더된 비설정 텍스트의 크기가 따라 변한다", () => {
  const { container, getByText } = render(React.createElement(ScaleHarness))
  const statusText = getByText("오프라인")

  setTextSize(container, GENERAL_SETTING_TEXT_SIZE.defaultValue)
  const atDefault = expectedFontSizePxFromWiring(statusText)

  setTextSize(container, GENERAL_SETTING_TEXT_SIZE.min)
  const atMin = expectedFontSizePxFromWiring(statusText)

  setTextSize(container, GENERAL_SETTING_TEXT_SIZE.max)
  const atMax = expectedFontSizePxFromWiring(statusText)

  // 기본값에서는 원래 크기(10px)가 그대로여야 한다 — 저장한 적 없는 사용자에게 변화가 없다.
  assert.equal(atDefault, 10, "기본값에서 원래 크기가 보존되어야 한다")
  assert.ok(atMin < atDefault, `최솟값에서 작아져야 한다 — ${atMin} vs ${atDefault}`)
  assert.ok(atMax > atDefault, `최댓값에서 커져야 한다 — ${atMax} vs ${atDefault}`)

  // 같은 요소가 계속 마운트된 상태에서 변했다(다시 마운트해서 얻은 결과가 아니다).
  assert.equal(getByText("오프라인"), statusText)
})

test("F-15(AC-02): 배율은 좁은 범위로 제한되어 레이아웃을 흔드는 전체 확대가 아니다", () => {
  const { container, getByText } = render(React.createElement(ScaleHarness))
  const statusText = getByText("오프라인")

  setTextSize(container, GENERAL_SETTING_TEXT_SIZE.min)
  const atMin = expectedFontSizePxFromWiring(statusText)
  setTextSize(container, GENERAL_SETTING_TEXT_SIZE.max)
  const atMax = expectedFontSizePxFromWiring(statusText)

  // 부동소수 오차만 허용한다(px 기준 1e-9).
  assert.ok(
    atMin >= 10 * 0.85 - 1e-9 && atMax <= 10 * 1.15 + 1e-9,
    `배율 범위를 벗어났다 — ${atMin}~${atMax}`,
  )
})

test("F-15(AC-02/AC-06): 설정 초기화는 배율을 기본값으로 되돌리고, 저장된 값은 복원된다", async () => {
  const { container, getByText } = render(React.createElement(ScaleHarness))
  const statusText = getByText("오프라인")

  setTextSize(container, GENERAL_SETTING_TEXT_SIZE.max)
  assert.ok(expectedFontSizePxFromWiring(statusText) > 10)

  act(() => {
    useSettingsStore.getState().resetSettings()
  })
  assert.equal(expectedFontSizePxFromWiring(statusText), 10, "초기화 후 원래 크기로 돌아와야 한다")

  // 새로고침 복원: 저장된 값으로 store를 다시 세우면 같은 배율이 즉시 반영된다.
  setTextSize(container, GENERAL_SETTING_TEXT_SIZE.min)
  const atMin = expectedFontSizePxFromWiring(statusText)
  await new Promise((resolve) => setTimeout(resolve, 0))

  const saved = JSON.parse(localStorage.getItem("settings-storage")).state
  assert.equal(saved.generalTextSize, GENERAL_SETTING_TEXT_SIZE.min, "기기 저장에 반영돼야 한다")

  act(() => {
    useSettingsStore.setState({ generalTextSize: GENERAL_SETTING_TEXT_SIZE.defaultValue })
  })
  act(() => {
    useSettingsStore.setState({ generalTextSize: saved.generalTextSize })
  })
  assert.equal(expectedFontSizePxFromWiring(statusText), atMin, "복원한 값이 그대로 반영돼야 한다")
})

test("F-15(AC-02): 배율은 documentElement 변수 하나로만 전달되고 각 소비자는 인라인 font-size를 쓰지 않는다", () => {
  const { container } = render(React.createElement(ScaleHarness))

  setTextSize(container, GENERAL_SETTING_TEXT_SIZE.max)
  const expected = String(getAppTextScale(GENERAL_SETTING_TEXT_SIZE.max))
  assert.equal(document.documentElement.style.getPropertyValue(APP_TEXT_SCALE_CSS_VAR), expected)

  for (const element of container.querySelectorAll(".app-text-scaled")) {
    assert.equal(element.style.fontSize, "", "소비자가 인라인 font-size를 쓰면 배율이 무시된다")
  }
})

// ── 누락 소비자 회귀 방지 ──────────────────────────────────────────────
//
// "설정을 바꿔도 안 변하는 텍스트"가 다시 생기지 않도록, 소스 전체를 훑어 명시적
// font-size 선언이 모두 배율 경로를 지나는지 확인한다. 남겨둔 예외는 아래 한 곳뿐이며,
// 조용히 빠뜨리는 대신 시험이 그 경계를 강제한다.
//
// 인게임 화면(domains/game/ingame/**)의 "임의값 font-size 선언"은 일반 "텍스트 크기"에서
// 제외한다:
//   - 인게임 채팅은 자체 설정("채팅 글자 크기", --ingame-chat-text-scale)을 쓰므로 두 배율이
//     겹쳐 곱해지면 안 된다.
//   - 그 밖의 인게임 텍스트는 고정 크기 프레임(카드·투표·타임바) 안에 맞춰 놓은 값이라
//     일반 배율로 함께 키우면 레이아웃이 넘친다. 인게임 표시 설정은 인게임 설정 패널이 맡는다.
// 다만 표준 토큰(text-xs·text-sm)은 @theme에서 배율을 받으므로 인게임에서 그 토큰을 쓰는
// 몇 곳(액션 패널 등)도 함께 따라온다 — 상속 본문과 같은 성격이라 그대로 둔다.
const GENERAL_TEXT_SCALE_EXCLUDED_PREFIX = "domains/game/ingame/"
// variant 접두사(placeholder: 등)가 붙은 선언도 놓치지 않도록 앞을 고정하지 않는다.
// "app-text-scaled"·"[--app-text-size:...]"에는 "text-[" 가 없어 스스로 걸리지 않는다.
const EXPLICIT_FONT_SIZE = /text-\[(?:clamp\(|[0-9.]+(?:rem|px|em|vw|vh|vmin|vmax|cqi|cqw|cqh|cqb|cqmin|cqmax)\])/

function sourceFiles() {
  const root = SRC_ROOT
  const files = []
  ;(function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (!/\.(js|jsx)$/.test(entry)) continue
      if (/\.test\.js$/.test(entry)) continue
      files.push(full)
    }
  })(root)
  return files.map((full) => ({
    rel: relative(root, full).split(sep).join("/"),
    source: readFileSync(full, "utf8"),
  }))
}

test("F-15(AC-02): 인게임을 뺀 모든 화면의 명시적 font-size가 배율 경로를 지난다", () => {
  const missed = sourceFiles()
    .filter(({ rel }) => !rel.startsWith(GENERAL_TEXT_SCALE_EXCLUDED_PREFIX))
    .filter(({ source }) => EXPLICIT_FONT_SIZE.test(source))
    .map(({ rel }) => rel)

  assert.deepEqual(
    missed,
    [],
    `배율을 받지 않는 font-size 선언이 남아 있다(app-text-scaled로 바꿔야 한다): ${missed.join(", ")}`,
  )
})

test("F-15(AC-02): 제외 대상은 인게임 화면뿐이며 그 목록을 명시적으로 기록한다", () => {
  const excluded = sourceFiles()
    .filter(({ source }) => EXPLICIT_FONT_SIZE.test(source))
    .map(({ rel }) => rel)

  assert.ok(excluded.length > 0, "제외 목록이 비면 이 경계 시험이 의미를 잃는다")
  for (const rel of excluded) {
    assert.ok(
      rel.startsWith(GENERAL_TEXT_SCALE_EXCLUDED_PREFIX),
      `인게임 밖 파일이 제외 목록에 들어왔다: ${rel}`,
    )
  }
})

test("F-15(AC-02): app-text-scaled를 쓰는 곳은 반드시 --app-text-size를 함께 싣는다", () => {
  const isComment = (line) => /^\s*(?:\/\/|\/?\*)/.test(line)
  let checked = 0

  for (const { rel, source } of sourceFiles()) {
    source.split("\n").forEach((line, index) => {
      if (!line.includes("app-text-scaled") || isComment(line)) return

      checked += 1
      assert.ok(
        line.includes("[--app-text-size:"),
        `${rel}:${index + 1}: app-text-scaled에 --app-text-size가 없으면 크기가 1rem으로 떨어진다`,
      )
    })
  }

  assert.ok(checked > 0, "검사한 선언이 없으면 이 시험이 의미를 잃는다")
})

test("F-15(AC-02): 표준 Tailwind 글자 크기 토큰도 같은 배율을 따른다(기준값은 기본값 유지)", () => {
  const indexCss = readFileSync(new URL("../index.css", import.meta.url), "utf8")

  assert.match(indexCss, /--text-xs:\s*calc\(0\.75rem\s*\*\s*var\(--app-text-scale,\s*1\)\)/)
  assert.match(indexCss, /--text-sm:\s*calc\(0\.875rem\s*\*\s*var\(--app-text-scale,\s*1\)\)/)
})

test("F-15(AC-02): App이 배율 동기화 훅을 실제로 호출한다", () => {
  const appSource = readFileSync(new URL("../App.jsx", import.meta.url), "utf8")

  assert.match(appSource, /useAppTextScaleSync\(\)/)
})

