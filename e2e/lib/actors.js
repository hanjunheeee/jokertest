/**
 * 좌석(브라우저 컨텍스트) 하나를 감싸는 page object.
 *
 * 시나리오 스펙은 여기 함수만 부르고 셀렉터를 직접 쓰지 않는다. 화면 문구·속성 이름은
 * 전부 프런트의 프로덕션 상수/셀렉터 모듈에서 가져오므로, 문구가 바뀌면 스펙이 아니라
 * 이 파일이 곧바로 따라간다.
 *
 * 이 파일만 playwright에 의존한다 — 나머지 lib/*는 순수해서 브라우저 설치 없이 검증된다.
 */
import { expect, test } from "@playwright/test"
import {
  INGAME_KILL_REVEAL_FALLBACK_TIMEOUT_MS,
  INGAME_KILL_REVEAL_RETRY_LABEL,
  INGAME_KILL_REVEAL_SKIP_LABEL,
} from "../../frontend/src/domains/game/ingame/constants/killReveal/ingameKillReveal.js"
import {
  INGAME_NIGHT_PRIVATE_RESULT_CONFIRM_LABEL,
  INGAME_NIGHT_PRIVATE_RESULT_DIALOG_LABEL,
} from "../../frontend/src/domains/game/ingame/constants/nightPrivateResult/ingameNightPrivateResult.js"
import { INGAME_NIGHT_TURN_ANNOUNCEMENT_CLOSE_LABEL } from "../../frontend/src/domains/game/ingame/constants/nightTurn/ingameNightTurnAnnouncement.js"
import {
  INGAME_PHASE_ENTRANCE_CONFIRM_LABEL,
  INGAME_PHASE_ENTRANCE_DIALOG_LABEL,
  INGAME_PHASE_ENTRANCE_MESSAGES,
} from "../../frontend/src/domains/game/ingame/constants/phaseEntrance/ingamePhaseEntrance.js"
import { TRIBUNAL_VOTE_GUILTY_LABEL, TRIBUNAL_VOTE_SUBMIT_LABEL } from "../../frontend/src/domains/game/ingame/constants/actions/ingameActionPanel.js"
import { INGAME_E2E_ATTRS } from "../../frontend/src/domains/game/ingame/constants/e2e/ingameE2eHooks.js"
import { MATCHING_POPUP_COPY } from "../../frontend/src/domains/game/matching/constants/gameMatchingAssets.js"
import { ROOM_SETUP_PLAN, SEAT_ROLES, expectedRoleRevealTexts } from "./scenarioPlan.js"
import * as selectors from "./selectors.js"

/**
 * 방장의 방이 공개 목록에 나타날 때까지 기다려주는 상한(소켓 연결 + 브로드캐스트 왕복 여유).
 */
const PUBLIC_ROOM_APPEAR_TIMEOUT_MS = 30_000

/**
 * 오버레이 dialog의 aria-label. phase entrance·개인 결과는 프런트 상수를 그대로 쓰고,
 * 역할 공개·밤 역할 턴 안내는 .jsx에 인라인으로 적혀 있어(상수 모듈이 없다) 여기 적는다.
 */
const ROLE_REVEAL_DIALOG_LABEL = "내 역할 보기"
const NIGHT_TURN_DIALOG_LABEL = "밤 역할 안내"

/** 역할 공개 오버레이의 확인 버튼 문구(InGameRoleRevealOverlay의 primaryLabel 기본값). */
const ROLE_REVEAL_CONFIRM_LABEL = "확인"

/** settleOverlays가 한 번 호출에서 닫아줄 오버레이 최대 개수 — 무한 루프 방지용 상한. */
const MAX_OVERLAY_PASSES = 16

/** 기대한 오버레이가 서버 이벤트를 타고 도착할 때까지 기다려주는 상한. */
const OVERLAY_SETTLE_TIMEOUT_MS = 90_000

/** 사망 연출을 기다려주는 최대 시간 — 프런트 워치독보다 넉넉히 잡는다. */
const KILL_REVEAL_MAX_WAIT_MS = INGAME_KILL_REVEAL_FALLBACK_TIMEOUT_MS + 20_000

/**
 * 단계별 스크린샷을 남길지 여부. `E2E_STEP_SHOTS=0`으로 끌 수 있다 — 5창 × 수십 단계라
 * 런타임이 문제가 될 때 사람이 손댈 수 있는 탈출구를 하나 남겨둔다.
 */
const STEP_SHOTS_ENABLED = process.env.E2E_STEP_SHOTS?.trim() !== "0"

/**
 * 스크린샷 파일 이름에 쓸 수 있게 문자열을 정규화한다.
 * @param {string} value 단계 이름·좌석 라벨처럼 공백·괄호·구분점이 섞인 문자열
 * @flow 파일명에 쓸 수 없거나 셸에서 성가신 문자를 전부 "-"로 접고, 연속된 "-"는 하나로 줄인다.
 */
function toFileNamePart(value) {
  return String(value)
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * 지금 화면을 그 단계의 기록으로 남긴다.
 * @param {object} seat 좌석
 * @param {string} label 단계 이름
 * @flow playwright.config의 screenshot:"only-on-failure"와 역할이 다르다 — 그쪽은 실패한 순간
 *   하나이고 이쪽은 통과한 단계들의 진행 기록이다. 스크린샷 실패(창이 이미 닫힌 경우 등)로
 *   시나리오를 무너뜨리지 않는다: 기록은 검증이 아니다.
 */
export async function captureStep(seat, label) {
  if (!STEP_SHOTS_ENABLED) return
  try {
    const fileName = `${toFileNamePart(label)}__${toFileNamePart(seat.label)}.png`
    await seat.page.screenshot({ path: test.info().outputPath(fileName) })
  } catch {
    // 기록이 남지 않는 것은 시나리오의 실패가 아니다.
  }
}

/**
 * 관측 검증 하나를 실패해도 멈추지 않는 형태로 실행한다(soft-assert).
 * @param {object} failureLog createFailureLog가 만든 수집기
 * @param {string} step 지금 단계 이름(요약에 그대로 들어간다)
 * @param {object} seat 좌석
 * @param {Function} fn 검증 본문(async)
 * @flow 실패하면 수집기에 기록하고 그 순간의 화면을 FAIL-{step}으로 남긴 뒤 false를 돌려준다.
 *   **관측 전용 계약**: 제출·집계·전이 같은 진행 동작에는 절대 쓰지 않는다 — 진행이 실패한
 *   뒤의 관측은 전부 무의미해서 요약이 잡음으로 가득 차기 때문이다.
 * @returns {Promise<boolean>} 검증이 통과했으면 true
 */
export async function softly(failureLog, step, seat, fn) {
  try {
    await fn()
    return true
  } catch (error) {
    failureLog.record({ step, seatLabel: seat.label, message: error })
    await captureStep(seat, `FAIL-${step}`)
    return false
  }
}

/**
 * 좌석 하나를 위한 브라우저 컨텍스트와 페이지를 연다.
 * @param {import("@playwright/test").Browser} browser 테스트가 받은 브라우저
 * @param {object} account resolveE2eAccounts가 만든 계정 하나
 * @param {number} seatIndex 0-based 좌석 index(= 역할 index)
 * @flow 창마다 alert/confirm을 기록해 둔다 — 소켓 실패·방 생성 실패는 alert로만 드러나므로,
 *   조용히 무시하면 훨씬 뒤에서 엉뚱한 이유로 실패한다.
 * @returns {Promise<object>} seat 객체
 */
export async function openSeat(browser, account, seatIndex) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const seat = {
    index: seatIndex,
    role: SEAT_ROLES[seatIndex],
    account,
    context,
    page,
    dialogs: [],
    label: `S${seatIndex + 1}(${SEAT_ROLES[seatIndex]})`,
  }
  page.on("dialog", (dialog) => {
    seat.dialogs.push(dialog.message())
    dialog.dismiss().catch(() => {})
  })
  return seat
}

/**
 * 좌석의 브라우저 컨텍스트를 닫는다.
 * @param {object} seat openSeat이 만든 좌석
 */
export async function closeSeat(seat) {
  await seat.context.close()
}

/**
 * 그 창에서 alert/confirm이 뜨지 않았는지 확인한다.
 * @param {object} seat 좌석
 */
export function assertNoDialogs(seat) {
  expect(seat.dialogs, `${seat.label} 창에 예상치 못한 알림이 떴습니다`).toEqual([])
}

/**
 * 좌석 계정으로 로그인한다.
 * @param {object} seat 좌석
 * @flow /login으로 이동해 이메일·비밀번호를 채우고 제출한 뒤 /lobby 도달까지 기다린다.
 */
export async function login(seat) {
  await seat.page.goto("/login")
  await seat.page.getByPlaceholder("이메일을 입력하세요").fill(seat.account.email)
  await seat.page.getByPlaceholder("비밀번호를 입력하세요").fill(seat.account.password)
  await seat.page.getByRole("button", { name: "로그인", exact: true }).click()
  await seat.page.waitForURL("**/lobby")
  assertNoDialogs(seat)
}

/**
 * 스테퍼 조작 한 건을 재생한다.
 * @param {object} seat 좌석
 * @param {{label:string, direction:string, clicks:number}} step ROOM_SETUP_PLAN의 항목
 * @flow 클릭할 때마다 버튼이 활성 상태인지 확인한다 — 범위 끝에 닿아 비활성이 되면 그 자리에서
 *   실패하므로, 헛클릭으로 다른 값의 방이 만들어지는 일이 없다.
 */
async function applyStepperStep(seat, step) {
  const ariaLabel = `${step.label} ${step.direction === "increase" ? "증가" : "감소"}`
  const button = seat.page.getByRole("button", { name: ariaLabel, exact: true })
  for (let click = 0; click < step.clicks; click += 1) {
    await expect(button, `"${ariaLabel}" 버튼이 ${click + 1}번째 클릭에서 비활성입니다`).toBeEnabled()
    await button.click()
  }
}

/**
 * 방장 좌석이 5인 CUSTOM 방을 만든다.
 * @param {object} seat 방장 좌석
 * @flow /game-setup에서 ROOM_SETUP_PLAN을 순서대로 재생한 뒤 "게임 만들기"를 눌러
 *   /game-matching 도달까지 기다린다. 순서가 곧 계약이다(정원 → CUSTOM 전환 → 역할 인원).
 */
export async function createRoom(seat) {
  await seat.page.goto("/game-setup")
  const createButton = seat.page.getByRole("button", { name: "게임 만들기", exact: true })
  await expect(createButton).toBeVisible()

  for (const step of ROOM_SETUP_PLAN) {
    if (step.kind === "checkbox") {
      await seat.page.getByRole("checkbox", { name: step.label, exact: true }).click()
      continue
    }
    await applyStepperStep(seat, step)
  }

  await expect(createButton, "역할 구성이 유효하지 않아 방을 만들 수 없습니다").toBeEnabled()
  await createButton.click()
  await seat.page.waitForURL("**/game-matching")
  assertNoDialogs(seat)
}

/**
 * 좌석이 공개 방 목록에서 방장의 방을 찾아 입장한다.
 * @param {object} seat 좌석
 * @param {string} hostNickname 방장(S1) 계정의 닉네임 — 방 제목이 "{닉네임}의 방"이다
 * @flow /multiplay로 들어가면 usePublicRooms가 마운트 즉시 get_public_rooms로 목록을 받고
 *   이후 public_rooms_updated 브로드캐스트로 갱신한다 — 그래서 새로고침 없이 "그 방 row가
 *   1개가 될 때까지" 기다리는 것만으로 목록 갱신 계약을 그대로 따른다(toHaveCount가 타임아웃까지
 *   재시도하고, 같은 제목의 방이 둘이면 그 자리에서 실패한다). row 클릭은 선택일 뿐이라
 *   "선택한 방 입장" 버튼을 눌러야 실제 입장이며, 입장 실패는 alert로만 드러나므로
 *   assertNoDialogs로 마무리한다. 입장 순서가 곧 역할 배정 순서이므로 호출부는 반드시
 *   순차 await로 부른다.
 */
export async function joinFromRoomList(seat, hostNickname) {
  await seat.page.goto("/multiplay")

  const row = seat.page.getByRole("button", { name: selectors.publicRoomRowName(hostNickname) })
  await expect(
    row,
    `${seat.label}: "${selectors.publicRoomTitle(hostNickname)}"이(가) 입장 가능한 상태로 공개 방 목록에 나타나지 않았습니다`,
  ).toHaveCount(1, { timeout: PUBLIC_ROOM_APPEAR_TIMEOUT_MS })
  await row.click()

  const enterButton = seat.page.getByRole("button", { name: "선택한 방 입장", exact: true })
  await expect(
    enterButton,
    `${seat.label}: 입장 버튼이 활성화되지 않았습니다(코드 전용·마감 방일 수 있습니다)`,
  ).toBeEnabled()
  await enterButton.click()

  await seat.page.waitForURL("**/game-matching", { timeout: PUBLIC_ROOM_APPEAR_TIMEOUT_MS })
  assertNoDialogs(seat)
}

/**
 * 좌석이 준비 완료 상태가 된다.
 * @param {object} seat 좌석
 * @flow 이미 준비 상태면 버튼 문구가 "준비취소"라 이 셀렉터에 잡히지 않는다 — 그때는
 *   아무것도 하지 않고, 준비 문구가 사라졌는지로 완료를 확인한다.
 */
export async function setReady(seat) {
  const readyButton = seat.page.getByRole("button", { name: MATCHING_POPUP_COPY.readyOn, exact: true })
  await expect(readyButton).toBeEnabled()
  await readyButton.click()
  await expect(
    seat.page.getByRole("button", { name: MATCHING_POPUP_COPY.readyOff, exact: true }),
  ).toBeVisible()
}

/**
 * 방장이 게임을 시작한다.
 * @param {object} seat 방장 좌석
 * @flow 전원 준비가 끝나야 서버가 canStart를 내려주므로, 버튼이 활성이 될 때까지 기다린다.
 */
export async function startGame(seat) {
  const startButton = seat.page.getByRole("button", { name: MATCHING_POPUP_COPY.startGame, exact: true })
  await expect(startButton, "전원 준비가 끝나지 않아 게임을 시작할 수 없습니다").toBeEnabled()
  await startButton.click()
  await seat.page.waitForURL("**/ingame")
}

/**
 * 지정한 dialog 안의 버튼 하나를 누른다. 이미 사라졌으면 조용히 넘어간다.
 * @param {object} seat 좌석
 * @param {string} dialogLabel dialog의 aria-label
 * @param {string} buttonLabel 버튼 문구
 * @flow 밤 역할 턴 안내처럼 스스로 사라지는 오버레이가 있어, 클릭 직전에 사라지는 경쟁을
 *   실패로 취급하지 않는다(닫혔다는 결과는 어느 쪽이든 같다).
 * @returns {Promise<boolean>} 실제로 눌렀으면 true
 */
async function dismissDialog(seat, dialogLabel, buttonLabel) {
  const button = seat.page.getByRole("dialog", { name: dialogLabel }).getByRole("button", {
    name: buttonLabel,
    exact: true,
  })
  try {
    await button.click({ timeout: 5_000 })
    return true
  } catch {
    return false
  }
}

/**
 * 사망 연출이 끝날 때까지 처리한다.
 * @param {object} seat 좌석
 * @param {string|null} expectedMessage 기대하는 사망 문구(null이면 문구를 검증하지 않는다)
 * @flow 먼저 <video>가 실제로 붙어 있는지와 문구를 확인한 뒤, 오버레이가 사라질 때까지
 *   기다린다. 그 사이 "건너뛰기"(워치독/재생 오류) 또는 "다시 재생"(자동재생 거부)이 뜨면
 *   눌러 진행시킨다 — 어느 경로로도 화면이 영원히 막히지 않게 한다.
 */
async function settleKillReveal(seat, expectedMessage) {
  const overlay = seat.page.locator(selectors.killReveal())
  await expect(overlay.locator("video"), `${seat.label}: 사망 연출에 영상이 없습니다`).toBeAttached()
  if (expectedMessage !== null) {
    await expect(overlay.getByText(expectedMessage, { exact: true })).toBeVisible()
  }

  const skipButton = overlay.getByRole("button", { name: INGAME_KILL_REVEAL_SKIP_LABEL, exact: true })
  const retryButton = overlay.getByRole("button", { name: INGAME_KILL_REVEAL_RETRY_LABEL, exact: true })
  const deadline = Date.now() + KILL_REVEAL_MAX_WAIT_MS

  while (Date.now() < deadline) {
    if ((await overlay.count()) === 0) return
    if (await skipButton.isVisible().catch(() => false)) {
      await skipButton.click().catch(() => {})
      continue
    }
    if (await retryButton.isVisible().catch(() => false)) {
      await retryButton.click().catch(() => {})
      continue
    }
    await seat.page.waitForTimeout(250)
  }
  throw new Error(`${seat.label}: 사망 연출이 ${KILL_REVEAL_MAX_WAIT_MS}ms 안에 끝나지 않았습니다`)
}

/**
 * 지금 떠 있는 오버레이를 우선순위 순서대로 전부 닫는다. 이 스크립트의 심장이다.
 * @param {object} seat 좌석
 * @param {{expectKillReveal?: string|null, expectPrivateResult?: string|null, expectPhase?: string|null}} [expectations]
 *   expectKillReveal: 이 창에서 사망 연출이 떠야 하면 기대 문구(뜨지 않아야 하면 생략)
 *   expectPrivateResult: 개인 조사·확인 결과가 떠야 하면 기대 문구
 *   expectPhase: 진입 연출이 떠야 하면 기대 phase("DAY"/"NIGHT")
 * @flow 오버레이가 하나도 남지 않고 기대한 것도 전부 본 상태가 될 때까지 우선순위(역할 공개
 *   → 사망 연출 → 개인 결과 → 진입 연출 → 밤 역할 턴 안내)대로 훑는다. 화면이 잠깐 비어
 *   있어도 기대한 오버레이가 아직 안 왔으면 서버 이벤트를 기다린다(소켓 왕복을 스크립트가
 *   앞질러 가는 경쟁을 막는다). 기대하지 않은 사망 연출·개인 결과가 뜨면 즉시 실패한다 —
 *   뒤 단계를 헛돌리는 대신 어긋난 그 자리에서 멈추는 편이 진단에 낫다.
 * @returns {Promise<{sawKillReveal:boolean, sawPrivateResult:boolean, sawPhaseEntrance:boolean}>}
 */
export async function settleOverlays(seat, expectations = {}) {
  const expectKillReveal = expectations.expectKillReveal ?? null
  const expectPrivateResult = expectations.expectPrivateResult ?? null
  const expectPhase = expectations.expectPhase ?? null
  const seen = { sawKillReveal: false, sawPrivateResult: false, sawPhaseEntrance: false }
  const deadline = Date.now() + OVERLAY_SETTLE_TIMEOUT_MS
  let passes = 0

  while (Date.now() < deadline) {
    if (passes > MAX_OVERLAY_PASSES) {
      throw new Error(`${seat.label}: 오버레이가 ${MAX_OVERLAY_PASSES}번 안에 정리되지 않았습니다`)
    }

    if ((await seat.page.locator(selectors.killReveal()).count()) > 0) {
      if (expectKillReveal === null) {
        throw new Error(`${seat.label}: 뜨지 않아야 할 사망 연출이 떴습니다(보호가 실패했습니다)`)
      }
      await settleKillReveal(seat, expectKillReveal)
      seen.sawKillReveal = true
      passes += 1
      continue
    }

    const privateResult = seat.page.locator(selectors.nightPrivateResult())
    if ((await privateResult.count()) > 0) {
      if (expectPrivateResult === null) {
        throw new Error(`${seat.label}: 기대하지 않은 개인 조사 결과 오버레이가 떴습니다`)
      }
      await expect(privateResult.getByText(expectPrivateResult, { exact: true })).toBeVisible()
      await dismissDialog(
        seat,
        INGAME_NIGHT_PRIVATE_RESULT_DIALOG_LABEL,
        INGAME_NIGHT_PRIVATE_RESULT_CONFIRM_LABEL,
      )
      seen.sawPrivateResult = true
      passes += 1
      continue
    }

    if ((await seat.page.locator(selectors.phaseEntrance()).count()) > 0) {
      if (expectPhase !== null && !seen.sawPhaseEntrance) {
        await expect(seat.page.locator(selectors.phaseEntrance(expectPhase))).toBeAttached()
        await expect(
          seat.page.getByText(INGAME_PHASE_ENTRANCE_MESSAGES[expectPhase], { exact: true }),
        ).toBeVisible()
      }
      await dismissDialog(seat, INGAME_PHASE_ENTRANCE_DIALOG_LABEL, INGAME_PHASE_ENTRANCE_CONFIRM_LABEL)
      seen.sawPhaseEntrance = true
      passes += 1
      continue
    }

    // 역할 공개는 표시 전용이라 아래 화면을 잠그지 않지만, 열려 있으면 다른 오버레이를 막는다.
    if ((await seat.page.getByRole("dialog", { name: ROLE_REVEAL_DIALOG_LABEL }).count()) > 0) {
      await dismissDialog(seat, ROLE_REVEAL_DIALOG_LABEL, ROLE_REVEAL_CONFIRM_LABEL)
      passes += 1
      continue
    }

    // 밤 역할 턴 안내는 화면을 잠그지 않지만 backdrop이 포인터를 가로챈다. 2.6초 자동
    // 소멸을 기다리지 않고 명시적으로 닫아 클릭이 삼켜지지 않게 한다.
    if ((await seat.page.getByRole("dialog", { name: NIGHT_TURN_DIALOG_LABEL }).count()) > 0) {
      await dismissDialog(seat, NIGHT_TURN_DIALOG_LABEL, INGAME_NIGHT_TURN_ANNOUNCEMENT_CLOSE_LABEL)
      passes += 1
      continue
    }

    const unmet =
      (expectKillReveal !== null && !seen.sawKillReveal) ||
      (expectPrivateResult !== null && !seen.sawPrivateResult) ||
      (expectPhase !== null && !seen.sawPhaseEntrance)
    if (!unmet) return seen

    // 아직 서버 이벤트가 도착하지 않았을 뿐이다 — 잠깐 기다렸다 다시 본다.
    await seat.page.waitForTimeout(250)
  }

  const missing = [
    expectKillReveal !== null && !seen.sawKillReveal ? "사망 연출" : null,
    expectPrivateResult !== null && !seen.sawPrivateResult ? "개인 조사 결과" : null,
    expectPhase !== null && !seen.sawPhaseEntrance ? `${expectPhase} 진입 연출` : null,
  ].filter(Boolean)
  throw new Error(
    `${seat.label}: 기대한 오버레이가 ${OVERLAY_SETTLE_TIMEOUT_MS}ms 안에 뜨지 않았습니다 — ${missing.join(", ")}`,
  )
}

/**
 * canonical phase(와 dayIndex)가 될 때까지 기다린다.
 * @param {object} seat 좌석
 * @param {string} phase 기대 phase
 * @param {number} [dayIndex] 기대 dayIndex — 넘기면 함께 대조한다
 */
export async function waitForPhase(seat, phase, dayIndex) {
  await expect(
    seat.page.locator(selectors.controlPanelWithPhase(phase, dayIndex)),
    `${seat.label}: ${phase}${dayIndex === undefined ? "" : ` ${dayIndex}일차`}에 도달하지 못했습니다`,
  ).toBeAttached({ timeout: 60_000 })
}

/**
 * 역할 공개 오버레이의 역할명·진영 문구를 검증하고 닫는다.
 * @param {object} seat 좌석
 * @flow 좌석↔역할이 어긋나면(= DEBUG_FIXED_ROLES가 무시됐으면) 여기서 즉시 실패한다 —
 *   이 검증이 시나리오 전체의 첫 관문이다.
 */
export async function confirmRoleReveal(seat) {
  const expected = expectedRoleRevealTexts(seat.role)
  const dialog = seat.page.getByRole("dialog", { name: ROLE_REVEAL_DIALOG_LABEL })
  await expect(dialog, `${seat.label}: 역할 공개 오버레이가 뜨지 않았습니다`).toBeVisible()
  await expect(dialog.getByText(expected.name, { exact: true })).toBeVisible()
  await expect(dialog.getByText(expected.teamLabel, { exact: true })).toBeVisible()
  await expect(dialog.getByText(seat.account.nickname, { exact: true })).toBeVisible()
  await dismissDialog(seat, ROLE_REVEAL_DIALOG_LABEL, ROLE_REVEAL_CONFIRM_LABEL)
  await expect(dialog).toBeHidden()
  // 컨트롤 패널이 노출하는 본인 역할도 같은 값이어야 한다.
  await expect(seat.page.locator(selectors.controlPanelWithSelfRole(seat.role))).toBeAttached()
}

/**
 * 이 창의 본인 카드에 적힌 닉네임이 .env의 계정과 같은지 확인한다.
 * @param {object} seat 좌석
 * @flow 창과 계정이 어긋나면(컨텍스트 재사용 사고 등) 좌석 표 전체가 무의미해지므로 먼저 막는다.
 */
export async function assertSelfSeat(seat) {
  const selfCard = seat.page.locator(selectors.selfPlayerCard())
  await expect(selfCard, `${seat.label}: 본인 카드를 찾지 못했습니다`).toHaveCount(1)
  await expect(selfCard).toHaveAttribute(INGAME_E2E_ATTRS.playerNickname, seat.account.nickname)
}

/**
 * 대상 목록에서 닉네임 → uuid 표를 읽는다.
 * @param {object} seat 좌석
 * @param {Array<string>} nicknames 찾을 닉네임 목록
 * @flow 목록에는 본인이 빠져 있으므로 호출부가 두 좌석의 결과를 합쳐 5명을 채운다.
 *   닉네임 하나가 여러 버튼에 걸리면(부분 문자열 포함) 즉시 실패한다 — 잘못된 uuid로
 *   엉뚱한 사람을 암살하는 것보다 낫다.
 * @returns {Promise<Map<string,string>>}
 */
export async function readTargetUuids(seat, nicknames) {
  const found = new Map()
  for (const nickname of nicknames) {
        const button = seat.page
      .locator(selectors.anyTarget())
      .filter({ has: seat.page.getByText(nickname, { exact: true }) })
    const count = await button.count()
    if (count === 0) continue
    expect(count, `${seat.label}: 닉네임 "${nickname}"이 대상 버튼 ${count}개에 걸립니다`).toBe(1)
    const uuid = await button.getAttribute(INGAME_E2E_ATTRS.targetId)
    if (uuid) found.set(nickname, uuid)
  }
  return found
}

/**
 * 컨트롤 패널 안의 버튼 로케이터를 만든다.
 * @param {object} seat 좌석
 * @param {string} name 버튼 문구
 */
function panelButton(seat, name) {
  return seat.page.locator(selectors.controlPanel()).getByRole("button", { name, exact: true })
}

/**
 * 밤 행동 제출이 반영될 때까지 기다린다.
 * @param {object} seat 좌석
 * @flow 제출 완료 표시가 뜨거나, NIGHT 구간 자체가 끝나면(마지막 역할이 제출하면 서버가
 *   client resolve 없이 곧바로 밤을 판정한다) 완료로 본다 — 마지막 제출자에게는 완료 문구가
 *   화면에 남아 있을 틈이 없으므로 둘 중 하나만 확인해서는 경쟁이 생긴다.
 */
async function waitForNightSubmission(seat) {
  const submittedText = seat.page.getByText("제출 완료 · 다음 역할을 기다리는 중", { exact: true })
  const nightPanel = seat.page.locator(selectors.controlPanelWithPhase("NIGHT"))
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (await submittedText.isVisible().catch(() => false)) return
    if ((await nightPanel.count()) === 0) return
    await seat.page.waitForTimeout(200)
  }
  throw new Error(`${seat.label}: 밤 행동 제출이 반영되지 않았습니다`)
}

/**
 * 밤 행동 대상을 고르고 제출한다.
 * @param {object} seat 좌석
 * @param {string} actionLabel 행동 문구("암살"/"보호"/"조사"/"확인")
 * @param {string|null} targetUuid 대상 uuid(null이면 건너뛰기)
 * @flow 자기 턴이 와야 버튼이 활성화되므로 활성 대기 후에만 클릭한다. 대상 지정은
 *   대상 버튼 → "{행동} 확정" 순서이고, 건너뛰기는 대상 없이 바로 누른다.
 */
export async function submitNightAction(seat, actionLabel, targetUuid) {
  if (targetUuid === null) {
    const skipButton = panelButton(seat, "건너뛰기")
    await expect(skipButton, `${seat.label}: 밤 건너뛰기 버튼이 활성화되지 않았습니다`).toBeEnabled({
      timeout: 60_000,
    })
    await skipButton.click()
  } else {
    const targetButton = seat.page.locator(selectors.nightTarget(targetUuid))
    await expect(targetButton, `${seat.label}: 밤 행동 대상 버튼이 활성화되지 않았습니다`).toBeEnabled({
      timeout: 60_000,
    })
    await targetButton.click()
    const submitButton = panelButton(seat, `${actionLabel} 확정`)
    await expect(submitButton).toBeEnabled()
    await submitButton.click()
  }
  await waitForNightSubmission(seat)
}

/**
 * 밤 행동 패널이 그 밤에 실제로 떠 있는지(또는 행동 불가로 표시되는지) 검증한다.
 * @param {object} seat 좌석
 * @param {string|null} actionLabel 기대 행동 문구. null이면 "행동할 수 없습니다" 표시를 기대한다
 * @flow 요구서의 "조사 패널이 그 밤에 뜨는지 먼저 검증"이 이 함수다 — 제출보다 먼저 부른다.
 *   actionLabel === null 분기는 이제 **CITIZEN 전용**이다: 그 문구는 nightActionType이 null일
 *   때만 뜨는데(InGameActionPanel), WITCH_HUNTER의 밤 행동 하한이 0으로 내려가 그 역할은 시신이
 *   없는 밤에도 null이 되지 않는다. 마녀사냥꾼의 "이 밤엔 턴이 오지 않는다"는
 *   assertNightTurnAbsent로 검증한다.
 */
export async function assertNightActionPanel(seat, actionLabel) {
  const panel = seat.page.locator(selectors.controlPanel())
  if (actionLabel === null) {
    await expect(panel.getByText("이 밤에는 행동할 수 없습니다.", { exact: true })).toBeVisible()
    return
  }
  await expect(
    panel.getByRole("button", { name: `${actionLabel} 확정`, exact: true }),
    `${seat.label}: "${actionLabel}" 패널이 이 밤에 뜨지 않았습니다`,
  ).toBeVisible()
}

/**
 * 그 밤에 이 좌석의 역할 턴이 오지 않았음을 검증한다.
 * @param {object} seat 좌석
 * @param {{announcementMessage:string, actionLabel:string}} expectations
 *   announcementMessage: 턴이 왔다면 떴을 안내 문구(expectedNightTurnMessage가 만든 값)
 *   actionLabel: 그 역할의 밤 행동 문구("확인") — 확정 버튼 이름을 만드는 데 쓴다
 * @flow 관측 가능한 "턴이 오지 않음"은 두 가지다 — ① 안내 문구가 화면에 한 번도 없고,
 *   ② 확정·건너뛰기 버튼이 끝까지 비활성이다(nightActionControlsEnabled가 isNightActionTurn을
 *   요구한다). 세 번째 증거인 "아무것도 제출하지 않았는데 밤이 판정된다"는 호출부가 그 좌석에
 *   submitNightAction을 아예 부르지 않는 것으로 성립한다 — 자격이 있었다면 서버가 그 제출을
 *   기다리느라 밤이 영영 끝나지 않는다.
 */
export async function assertNightTurnAbsent(seat, { announcementMessage, actionLabel }) {
  await expect(
    seat.page.getByText(announcementMessage, { exact: true }),
    `${seat.label}: 오지 않아야 할 턴 안내("${announcementMessage}")가 떴습니다`,
  ).toHaveCount(0)
  await expect(
    panelButton(seat, `${actionLabel} 확정`),
    `${seat.label}: 턴이 오지 않은 밤인데 "${actionLabel} 확정"이 활성입니다`,
  ).toBeDisabled()
  await expect(
    panelButton(seat, "건너뛰기"),
    `${seat.label}: 턴이 오지 않은 밤인데 "건너뛰기"가 활성입니다`,
  ).toBeDisabled()
}

/**
 * 밤 행동 대상 목록에서 무엇을 고를 수 있고 무엇이 잠겨 있는지 검증한다.
 * @param {object} seat 좌석
 * @param {{selectableUuids:Array<string>, lockedUuids:Array<string>}} expectations
 *   selectableUuids: 지금 고를 수 있어야 하는 대상 uuid
 *   lockedUuids: 목록에는 있되 잠겨 있어야 하는 대상 uuid
 * @flow 요구서의 "대상 목록에 사망자만 나타나는지"의 실제 형태다 — 프로덕션은 생존자를 목록에서
 *   지우지 않고 selectable:false로 잠근다(buildNightActionTargets). 그래서 "목록에 없다"가 아니라
 *   "있되 전부 비활성"으로 검증한다. picker 전체가 nightActionControlsEnabled로 잠기므로 반드시
 *   그 좌석의 턴이 열린 뒤에 부른다 — 그 전에는 사망자 버튼도 비활성이다.
 */
export async function assertNightActionTargets(seat, { selectableUuids, lockedUuids }) {
  for (const uuid of selectableUuids) {
    await expect(
      seat.page.locator(selectors.nightTarget(uuid)),
      `${seat.label}: 고를 수 있어야 하는 대상(${uuid})이 잠겨 있습니다`,
    ).toBeEnabled()
  }
  for (const uuid of lockedUuids) {
    const target = seat.page.locator(selectors.nightTarget(uuid))
    await expect(target, `${seat.label}: 대상(${uuid})이 목록에서 사라졌습니다`).toHaveCount(1)
    await expect(target, `${seat.label}: 잠겨 있어야 하는 대상(${uuid})을 고를 수 있습니다`).toBeDisabled()
  }
}

/**
 * 결과 화면에서 로비로 나간다.
 * @param {object} seat 좌석
 * @flow 도착지는 `/lobby`가 아니라 `/multiplay`다 — 결과 페이지의 "로비로"는
 *   useGameResultLobbyExit → createSessionEndFinalizer를 타고 navigate("/multiplay")로 끝나며,
 *   leave ack의 성패와 무관하게 언제나 같은 경로다. 사망 좌석을 포함해 5창 전부가 이 경로로
 *   명시적으로 이탈해야 다음 실행에 세션이 남지 않는다.
 */
export async function returnToLobby(seat) {
  const lobbyButton = seat.page.getByRole("button", { name: "로비로", exact: true })
  await expect(lobbyButton, `${seat.label}: 결과 화면에 로비 버튼이 없습니다`).toBeEnabled()
  await lobbyButton.click()
  await seat.page.waitForURL("**/multiplay", { timeout: 60_000 })
  assertNoDialogs(seat)
}

/**
 * 낮 투표를 제출한다.
 * @param {object} seat 좌석
 * @param {string|null} targetUuid 지목할 대상 uuid(null이면 기권)
 * @flow 기권은 대상 선택 없이 바로 누르고, 지목은 대상 버튼 → "투표" 순서다.
 */
export async function dayVote(seat, targetUuid) {
  if (targetUuid === null) {
    const abstainButton = panelButton(seat, "기권")
    await expect(abstainButton).toBeEnabled({ timeout: 60_000 })
    await abstainButton.click()
    await expect(seat.page.getByText("기권함", { exact: true })).toBeVisible()
    return
  }
  const targetButton = seat.page.locator(selectors.nightTarget(targetUuid))
  await expect(targetButton).toBeEnabled({ timeout: 60_000 })
  await targetButton.click()
  const voteButton = panelButton(seat, "투표")
  await expect(voteButton).toBeEnabled()
  await voteButton.click()
  await expect(seat.page.getByText(/^투표: /)).toBeVisible()
}

/**
 * 낮 집계를 요청한다(창 하나만 누르면 된다).
 * @param {object} seat 좌석
 * @param {string} expectedNextPhase 집계 결과로 전이해야 하는 phase("NIGHT"/"TRIBUNAL")
 * @flow 집계 결과 문구는 DAY 섹션 안에만 있어 전이와 동시에 사라진다 — 그 문구를 기다리면
 *   경쟁이 생기므로, 서버 판정을 canonical phase 전이로 검증한다(ABSTAINED면 NIGHT,
 *   TRIBUNAL이면 TRIBUNAL). 전이 자체가 곧 집계 결과다.
 */
export async function resolveDayVote(seat, expectedNextPhase) {
  const resolveButton = panelButton(seat, "낮 집계")
  await expect(resolveButton).toBeEnabled({ timeout: 60_000 })
  await resolveButton.click()
  await expect(
    seat.page.locator(selectors.controlPanelWithPhase(expectedNextPhase)),
    `${seat.label}: 낮 집계 후 ${expectedNextPhase}로 전이하지 않았습니다`,
  ).toBeAttached({ timeout: 60_000 })
}

/**
 * 재판에서 유죄를 제출한다.
 * @param {object} seat 좌석
 * @flow 유죄 선택 → 제출 순서이며, 제출 확인 문구가 뜰 때까지 기다린다.
 */
export async function tribunalVoteGuilty(seat) {
  const guiltyButton = panelButton(seat, TRIBUNAL_VOTE_GUILTY_LABEL)
  await expect(guiltyButton).toBeEnabled({ timeout: 60_000 })
  await guiltyButton.click()
  const submitButton = panelButton(seat, TRIBUNAL_VOTE_SUBMIT_LABEL)
  await expect(submitButton).toBeEnabled()
  await submitButton.click()
  await expect(seat.page.getByText(`제출함: ${TRIBUNAL_VOTE_GUILTY_LABEL}`, { exact: true })).toBeVisible()
}

/**
 * 재판 판정을 요청한다(창 하나만 누르면 된다).
 * @param {object} seat 좌석
 */
export async function resolveTribunal(seat) {
  const resolveButton = panelButton(seat, "재판 판정")
  await expect(resolveButton).toBeEnabled({ timeout: 60_000 })
  await resolveButton.click()
}

/**
 * 결과 페이지 도달과 승패·정체 공개 목록을 검증한다.
 * @param {object} seat 좌석
 * @param {"승리"|"패배"} expectedBanner 이 창에 떠야 하는 배너 문구
 * @param {Array<{nickname:string, job:string}>} expectedReveals 전원 정체 공개 목록
 * @flow /gameresult 도달까지 기다린 뒤 배너·닉네임·직업·로비 버튼을 차례로 확인한다.
 */
export async function assertGameResult(seat, expectedBanner, expectedReveals) {
  await seat.page.waitForURL("**/gameresult", { timeout: 60_000 })
  await expect(
    seat.page.getByText(expectedBanner, { exact: true }),
    `${seat.label}: 결과 배너가 "${expectedBanner}"가 아닙니다`,
  ).toBeVisible()
  for (const reveal of expectedReveals) {
    const row = seat.page.getByRole("listitem").filter({ hasText: reveal.nickname })
    await expect(row, `${seat.label}: ${reveal.nickname}의 정체 공개 줄이 없습니다`).toHaveCount(1)
    await expect(row.getByText(reveal.job, { exact: true })).toBeVisible()
  }
  await expect(seat.page.getByRole("button", { name: "로비로", exact: true })).toBeVisible()
}
