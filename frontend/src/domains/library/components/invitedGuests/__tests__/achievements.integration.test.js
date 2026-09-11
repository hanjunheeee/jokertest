import assert from "node:assert/strict"
import test from "node:test"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createElement } from "react"
import { JSDOM } from "jsdom"
import { cleanup, render } from "@testing-library/react"
import { publicAsset } from "../../../../../shared/utils/publicAsset.js"

// F-12 AC-01/AC-06: 금지된 기록 7개 + 직업 도전과제 15개(합계 22개)의 서버 업적 상태 연결을
// 고정한다. 이 저장소의 테스트는 node --test로 돌고 JSX를 변환하지 않으므로(frontend/package.json의
// test 스크립트) .jsx는 import할 수 없다 — roomListRowCodeAndSubmit.test.js/podiumRoute.test.js와
// 같은 관례로, 값이 실제로 어떻게 합쳐지는지는 순수 함수(mergeInvitedGuestsSpreads)를 그대로
// 실행해 확인하고, 화면(.jsx) 쪽 배선은 소스 문자열을 읽어 연결 지점이 실제로 있는지 확인한다.

const here = path.dirname(fileURLToPath(import.meta.url))
// frontend/src (이 파일: src/domains/library/components/invitedGuests/__tests__/)
const srcRoot = path.resolve(here, "..", "..", "..", "..", "..")

function readSrc(relativePath) {
  return readFileSync(path.join(srcRoot, relativePath), "utf8")
}

function assertWires(relativePath, patterns) {
  const source = readSrc(relativePath)
  for (const [pattern, why] of patterns) {
    assert.match(source, pattern, `${relativePath}: ${why}`)
  }
}

const { mergeInvitedGuestsSpreads } = await import("../../../content/invitedGuests/mergeInvitedGuestsSpreads.js")
const { INVITED_GUESTS_JOB_CHALLENGES } = await import("../../../content/invitedGuests/jobChallenges.js")
const { INVITED_GUESTS_JOB_SPREAD_META } = await import("../../../content/invitedGuests/jobSpreadMeta.js")
const { INVITED_GUESTS_JOB_CATALOG } = await import("../../../content/invitedGuests/jobCatalog.js")
const { FORBIDDEN_RECORDS_SPREAD_META } = await import("../../../content/forbiddenRecords/spreadMeta.js")
const { resolveForbiddenRecordChallengeState } = await import("../../../content/forbiddenRecords/resolveForbiddenRecordChallengeState.js")

// ── CODEX-3 재검토(AC-01): 순수 함수 실행·소스 문자열 검사를 넘어선 실제 DOM 렌더 ──
//
// ForbiddenRecordsUnlockCondition.jsx/ForbiddenRecordsUnlockRewards.jsx/
// InvitedGuestsChallengeRow.jsx/InvitedGuestsChallengeRewards.jsx는 이 슬라이스에서
// .js(createElement, JSX 없음)로 옮겨졌다 — InGameParchmentPanelBase.js가 이미 쓰는
// 이유와 같다: 이 저장소의 node --test는 변환기가 없어 실제 JSX 구문은 파싱할 수 없으므로,
// 실제 프로덕션 DOM을 검증해야 하는 화면은 테스트가 그대로 import할 수 있는 .js여야 한다.
// (mock.module로 .jsx 의존성을 대체하는 방법도 시도했지만, node:test의 모듈 목(mock) 로더는
// 대상의 실제 파일 포맷을 먼저 판별하려 시도해 .jsx 확장자에서 ERR_UNKNOWN_FILE_EXTENSION으로
// 실패한다 — 그래서 보상 렌더러까지 함께 옮겼다.) PublicAsset.jsx(공용 이미지 컴포넌트)는
// 옮기지 않았다 — 그 컴포넌트는 이 앱 전역에서 널리 쓰여 범위 밖이므로, 두 보상 렌더러는
// PublicAsset.jsx를 쓰는 대신 그 컴포넌트가 실제로 하는 일(publicAsset() 경로 계산 + NFD
// 재시도)을 그대로 복제해 <img>를 직접 그린다(각 파일 상단 주석 참고). 이 테스트가 실제로
// 확인하는 것은 "F-12가 직접 건드린 조건·행·보상 표시 컴포넌트가 실제 spreadMeta.js/
// jobChallenges.js 원문·서버 진행률을 실제 DOM에 그대로 전달하는가"이다.
const { default: ForbiddenRecordsUnlockCondition } = await import("../../forbiddenRecords/ForbiddenRecordsUnlockCondition.js")
const { default: InvitedGuestsChallengeRow } = await import("../shared/InvitedGuestsChallengeRow.js")

let integrationDom = null
function ensureClientEnvironment() {
  if (globalThis.document?.body) return
  integrationDom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" })
  globalThis.window = integrationDom.window
  globalThis.document = integrationDom.window.document
  globalThis.HTMLElement = integrationDom.window.HTMLElement
  globalThis.Node = integrationDom.window.Node
  globalThis.MutationObserver = integrationDom.window.MutationObserver
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
}

// ── 순수 함수: mergeInvitedGuestsSpreads가 서버 달성 id로 cleared·진행률을 판정한다 ──
//
// CODEX-2 재검토(AC-06): cleared는 이제 achieved(진행률 조건 충족)가 아니라 granted(실제
// 지급 이력)로 판정한다 — 조건은 채웠지만 지급이 아직 실패·지연된 상태를 "클리어"로 잘못
// 보여주면 안 된다. 아래 고정값들은 그 구분을 그대로 반영한다.

const SPREAD_META = [{ id: "spread-noble", jobKey: "noble" }, { id: "spread-clown", jobKey: "clown" }]
const CATALOG = {
  noble: { jobName: "귀족", description: "", standingImage: "", standingImageClass: "", standingImageWrapClass: "" },
  clown: { jobName: "광대", description: "", standingImage: "", standingImageClass: "", standingImageWrapClass: "" },
}
const CHALLENGES = {
  noble: [
    { id: "noble-win-10", label: "귀족으로 10회 승리", rewards: [] },
    { id: "noble-win-20", label: "귀족으로 20회 승리", rewards: [] },
  ],
  clown: [
    { id: "clown-win-10", label: "광대로 10회 승리", rewards: [] },
  ],
}

test("AC-01/AC-06: 실제로 지급된(granted:true) 업적 id만 해당 직업 도전과제의 cleared:true로 표시되고, current·threshold도 함께 전달된다(CODEX-2 재검토)", () => {
  const pages = mergeInvitedGuestsSpreads(SPREAD_META, CATALOG, CHALLENGES, {
    byJobKey: {
      noble: {
        status: "success", myStats: null, ranking: [], error: null,
        achievementsById: {
          "noble-win-10": { achieved: true, current: 12, threshold: 10, granted: true },
          // achieved:true지만 아직 지급 이력이 없다(지급 대기/실패) — cleared는 false여야 한다.
          "noble-win-20": { achieved: true, current: 20, threshold: 20, granted: false },
        },
      },
    },
  })

  const noblePage = pages.find((p) => p.jobKey === "noble")
  assert.deepEqual(
    noblePage.right.challenges.map((c) => [c.id, c.cleared, c.current, c.threshold]),
    [["noble-win-10", true, 12, 10], ["noble-win-20", false, 20, 20]],
  )
})

test("AC-01: 한 직업의 지급 id가 다른 직업 도전과제를 잘못 클리어시키지 않는다", () => {
  const pages = mergeInvitedGuestsSpreads(SPREAD_META, CATALOG, CHALLENGES, {
    byJobKey: {
      noble: { status: "success", myStats: null, ranking: [], error: null, achievementsById: { "noble-win-10": { achieved: true, current: 10, threshold: 10, granted: true } } },
      // clown은 아직 조회 전(idle)이라 achievementsById가 없다 — 빈 값으로 안전하게 처리돼야 한다.
      clown: { status: "idle", myStats: null, ranking: null, error: null },
    },
  })

  const clownPage = pages.find((p) => p.jobKey === "clown")
  assert.deepEqual(clownPage.right.challenges.map((c) => c.cleared), [false])
})

test("jobState가 아예 없으면(모듈 최초 로드 시점) 모든 도전과제가 cleared:false다 — 더미로 대체하지 않는다", () => {
  const pages = mergeInvitedGuestsSpreads(SPREAD_META, CATALOG, CHALLENGES)
  for (const page of pages) {
    assert.equal(page.right.challenges.every((c) => c.cleared === false), true)
  }
})

// ── AC-01: 실제 22개 중 직업 도전과제 15개 전부가 원문·순서를 유지한 채 병합된다 ──

test("AC-01/AC-06: 실제 INVITED_GUESTS_JOB_CHALLENGES 15개 전부가 label·rewards 원문을 유지한 채 서버 지급 id로 cleared된다", () => {
  const allJobIds = Object.values(INVITED_GUESTS_JOB_CHALLENGES).flatMap((list) => list.map((c) => c.id))
  assert.equal(allJobIds.length, 15, "직업 도전과제는 5직업 × 3단계 = 15개여야 한다")

  // 이번 라운드에 각 직업의 win-10만 "실제로 지급"됐다고 가정한다 — 나머지(win-20/30)는
  // 미클리어로 남아야 한다(CODEX-2 재검토: achieved가 아니라 granted가 cleared를 판정한다).
  const grantedIds = new Set(allJobIds.filter((id) => id.endsWith("-win-10")))
  const byJobKey = Object.fromEntries(
    Object.keys(INVITED_GUESTS_JOB_CHALLENGES).map((jobKey) => [
      jobKey,
      {
        status: "success", myStats: null, ranking: [], error: null,
        achievementsById: Object.fromEntries(
          INVITED_GUESTS_JOB_CHALLENGES[jobKey].map((c) => [c.id, { achieved: grantedIds.has(c.id), current: 0, threshold: 0, granted: grantedIds.has(c.id) }]),
        ),
      },
    ]),
  )

  const pages = mergeInvitedGuestsSpreads(INVITED_GUESTS_JOB_SPREAD_META, INVITED_GUESTS_JOB_CATALOG, INVITED_GUESTS_JOB_CHALLENGES, { byJobKey })

  assert.equal(pages.length, 5, "직업 spread는 5개(귀족/광대/주치의/경비원/마녀사냥꾼)여야 한다")
  let checkedCount = 0
  for (const jobKey of Object.keys(INVITED_GUESTS_JOB_CHALLENGES)) {
    const page = pages.find((p) => p.jobKey === jobKey)
    const sourceChallenges = INVITED_GUESTS_JOB_CHALLENGES[jobKey]
    assert.equal(page.right.challenges.length, sourceChallenges.length)
    sourceChallenges.forEach((source, index) => {
      const merged = page.right.challenges[index]
      // 원문(id·label·rewards)이 병합 후에도 그대로 보존돼야 한다 — 새 필드(cleared/current/
      // threshold)만 덧붙을 뿐 기존 표시 문구를 바꾸면 안 된다.
      assert.equal(merged.id, source.id)
      assert.equal(merged.label, source.label)
      assert.deepEqual(merged.rewards, source.rewards)
      assert.equal(merged.cleared, grantedIds.has(source.id), `${source.id}: cleared가 서버 지급 여부와 달라야 할 이유가 없다`)
      checkedCount += 1
    })
  }
  assert.equal(checkedCount, 15, "직업 도전과제 15개 전부를 확인해야 한다")
})

// ── CODEX-2 재검토(AC-01): 실제 22개 중 나머지 금지된 기록 7개도 실제 실행으로 검증한다 ──
//
// InvitedGuests 쪽 15개는 위에서 mergeInvitedGuestsSpreads(순수 함수)를 실제 데이터 위에서
// 직접 실행해 원문·판정을 검증한다. ForbiddenRecords 쪽은 지금까지 화면(.jsx) 소스 문자열
// 검사로만 확인돼 있었다 — ForbiddenRecordsRightPage.jsx는 .md?raw로 원고를 읽는
// pages.js를 거치는데, 그 import는 Vite 전용이라 이 저장소의 node --test로는 실행할 수
// 없다(getForbiddenRecordsPage 자체를 이 테스트에서 import할 수 없는 이유). 하지만 표시에
// 실제로 필요한 잠금 조건·진행 단위·보상은 전부 spreadMeta.js(순수 JS, .md 의존 없음)에
// 있고, 화면의 클리어·진행률 계산은 resolveForbiddenRecordChallengeState.js(순수 함수,
// JSX 없음)로 이미 뽑아져 있다 — 이 둘을 실제로 실행하면 7개 기록 전부의 원문 보존과
// 클리어·진행률 판정을 소스 문자열 검사가 아니라 실제 실행으로 검증할 수 있다.
test("AC-01/AC-06: 실제 FORBIDDEN_RECORDS_SPREAD_META 7개 전부가 unlockCondition·unlockRewards·progressUnit 원문을 유지한 채 서버 지급 상태로 cleared·진행률이 계산된다", () => {
  assert.equal(FORBIDDEN_RECORDS_SPREAD_META.length, 7, "금지된 기록은 7개여야 한다")

  let checkedCount = 0
  for (const spread of FORBIDDEN_RECORDS_SPREAD_META) {
    const { unlockCondition, unlockProgress, unlockRewards, progressUnit } = spread.right

    // 아직 서버 조회가 성공하기 전(achievement 없음): 로딩/오류/최초 idle 상태에 따라
    // 다른 문구를 보여줘야 한다 — 계정과 무관한 정적 더미(unlockProgress)를 실제 진행률처럼
    // 보여주는 건 idle일 때만이다(CODEX-1 AC-06 재검토).
    const loading = resolveForbiddenRecordChallengeState({ achievement: null, status: "loading", error: null, unlockProgress, progressUnit })
    assert.equal(loading.challengeCleared, false)
    assert.equal(loading.displayedProgress, "진행률을 불러오는 중…")

    const errored = resolveForbiddenRecordChallengeState({ achievement: null, status: "error", error: "네트워크 오류", unlockProgress, progressUnit })
    assert.equal(errored.displayedProgress, "네트워크 오류")

    const idle = resolveForbiddenRecordChallengeState({ achievement: null, status: "idle", error: null, unlockProgress, progressUnit })
    assert.equal(idle.displayedProgress, unlockProgress, "idle 상태에서는 정적 더미 진행률을 그대로 보여줘야 한다(원문 보존)")

    // 서버가 achieved:true·granted:false(지급 대기/실패)를 내려주면 아직 클리어가 아니다.
    const pending = resolveForbiddenRecordChallengeState({
      achievement: { current: 3, threshold: 3, achieved: true, granted: false }, status: "success", error: null, unlockProgress, progressUnit,
    })
    assert.equal(pending.challengeCleared, false, "achieved여도 granted가 아니면 클리어로 보이면 안 된다(CODEX-2 재검토 AC-06)")
    assert.equal(pending.displayedProgress, `3/3${progressUnit}`, "실제 진행률 문구는 원본 progressUnit 꼬리말을 그대로 써야 한다")

    // 서버가 granted:true를 내려주면 실제로 클리어다.
    const granted = resolveForbiddenRecordChallengeState({
      achievement: { current: 3, threshold: 3, achieved: true, granted: true }, status: "success", error: null, unlockProgress, progressUnit,
    })
    assert.equal(granted.challengeCleared, true)

    // unlockCondition·unlockRewards는 이 함수가 건드리지 않는 값이다 — spreadMeta.js
    // 원문이 그대로 남아있는지(참조가 아니라 값 자체)만 재확인한다.
    assert.equal(typeof unlockCondition, "string")
    assert.ok(Array.isArray(unlockRewards) && unlockRewards.length > 0)

    checkedCount += 1
  }
  assert.equal(checkedCount, 7, "금지된 기록 7개 전부를 확인해야 한다")
})

// ── CODEX-3 재검토(AC-01): 금지된 기록 7개 — 실제 DOM 렌더 + 원문 보존 ──────────────

test("AC-01: FORBIDDEN_RECORDS_SPREAD_META 7개 전부가 실제 렌더된 DOM에 unlockCondition·진행률·unlockRewards 원문을 그대로 보여준다", () => {
  ensureClientEnvironment()
  let checkedCount = 0
  try {
    for (const spread of FORBIDDEN_RECORDS_SPREAD_META) {
      const { unlockCondition, unlockRewards, progressUnit } = spread.right
      const { displayedProgress } = resolveForbiddenRecordChallengeState({
        achievement: { current: 1, threshold: 3, achieved: false, granted: false },
        status: "success",
        error: null,
        unlockProgress: spread.right.unlockProgress,
        progressUnit,
      })

      const { unmount } = render(
        createElement(ForbiddenRecordsUnlockCondition, {
          condition: unlockCondition,
          progress: displayedProgress,
          rewards: unlockRewards,
        }),
      )
      try {
        // 조건 원문이 실제 DOM 텍스트로 그대로 나온다(대괄호로 감싸는 레이아웃과 별개로).
        assert.equal(
          document.body.textContent.includes(unlockCondition),
          true,
          `${spread.id}: unlockCondition 원문("${unlockCondition}")이 실제 렌더 DOM에 없다`,
        )
        // 서버 진행률("1/3" + progressUnit)도 원본 꼬리말(progressUnit)을 유지한 채 렌더된다.
        assert.equal(
          document.body.textContent.includes(`1/3${progressUnit}`),
          true,
          `${spread.id}: 진행률 문구가 실제 DOM에 없다`,
        )
        // 보상(unlockRewards)은 icon·count가 그대로 실제 <img>·텍스트로 렌더된다(진짜
        // ForbiddenRecordsUnlockRewards.js가 publicAsset()으로 계산한 src를 포함해서).
        const rewardIcons = document.querySelectorAll("img[data-asset-src]")
        assert.equal(rewardIcons.length, unlockRewards.length, `${spread.id}: 보상 개수가 원문과 다르다`)
        unlockRewards.forEach((reward, index) => {
          assert.equal(rewardIcons[index].getAttribute("data-asset-src"), reward.icon)
          assert.equal(rewardIcons[index].getAttribute("src"), publicAsset(reward.icon))
          assert.equal(document.body.textContent.includes(`×${reward.count}`), true, `${spread.id}: 보상 수량(×${reward.count})이 실제 DOM에 없다`)
        })
        checkedCount += 1
      } finally {
        unmount()
      }
    }
  } finally {
    cleanup()
  }
  assert.equal(checkedCount, 7, "금지된 기록 7개 전부를 실제 렌더로 확인해야 한다")
})

// ── CODEX-3 재검토(AC-01): 직업 도전과제 15개 — 실제 DOM 렌더 + 원문 보존, cleared 분기 ──

test("AC-01: INVITED_GUESTS_JOB_CHALLENGES 15개 전부가 실제 렌더된 DOM에 label·rewards 원문을 유지하고, cleared 여부에 따라 다른 실제 DOM을 그린다", () => {
  ensureClientEnvironment()
  let checkedCount = 0
  try {
    for (const jobKey of Object.keys(INVITED_GUESTS_JOB_CHALLENGES)) {
      for (const challenge of INVITED_GUESTS_JOB_CHALLENGES[jobKey]) {
        // (1) 미클리어: label·진행률·rewards 원문이 실제 DOM에 그대로 나와야 한다.
        const notCleared = render(
          createElement(
            "table",
            null,
            createElement(
              "tbody",
              null,
              createElement(InvitedGuestsChallengeRow, {
                label: challenge.label,
                rewards: challenge.rewards,
                cleared: false,
                current: 7,
                threshold: challenge.difficulty === 1 ? 10 : challenge.difficulty === 2 ? 20 : 30,
              }),
            ),
          ),
        )
        try {
          assert.equal(
            document.body.textContent.includes(challenge.label),
            true,
            `${challenge.id}: label 원문("${challenge.label}")이 실제 렌더 DOM에 없다`,
          )
          // 보상(challenge.rewards)은 icon·count·label이 그대로 실제 <img>·텍스트/버튼으로
          // 렌더된다(진짜 InvitedGuestsChallengeRewards.js가 publicAsset()으로 계산한 src
          // 포함) — currency는 ×count 텍스트로, border는 확대 보기 버튼 라벨로 구분된다.
          const rewardIcons = document.querySelectorAll("img[data-asset-src]")
          assert.equal(rewardIcons.length, challenge.rewards.length, `${challenge.id}: 보상 개수가 원문과 다르다`)
          challenge.rewards.forEach((reward, index) => {
            assert.equal(rewardIcons[index].getAttribute("data-asset-src"), reward.icon)
            assert.equal(rewardIcons[index].getAttribute("src"), publicAsset(reward.icon))
            if (reward.type === "currency") {
              assert.equal(document.body.textContent.includes(`×${reward.count}`), true, `${challenge.id}: 보상 수량(×${reward.count})이 실제 DOM에 없다`)
            } else {
              assert.notEqual(
                document.querySelector(`button[aria-label="${reward.label} 크게 보기"]`),
                null,
                `${challenge.id}: 테두리 보상 확대 버튼("${reward.label} 크게 보기")이 실제 DOM에 없다`,
              )
            }
          })
        } finally {
          notCleared.unmount()
        }

        // (2) 클리어: 실제 지급 이력이 있으면 rewards 배선이 아니라 클리어 문구만 실제
        // DOM에 나와야 한다(원문 유출·중복 지급 표시 방지).
        const clearedRender = render(
          createElement(
            "table",
            null,
            createElement(
              "tbody",
              null,
              createElement(InvitedGuestsChallengeRow, { label: challenge.label, rewards: challenge.rewards, cleared: true }),
            ),
          ),
        )
        try {
          assert.equal(document.body.textContent.includes("-- 도전과제 클리어 --"), true, `${challenge.id}: 클리어 문구가 실제 DOM에 없다`)
          assert.equal(document.querySelectorAll("img[data-asset-src]").length, 0, `${challenge.id}: 클리어 상태에서 보상이 다시 렌더되면 안 된다`)
        } finally {
          clearedRender.unmount()
        }

        checkedCount += 1
      }
    }
  } finally {
    cleanup()
  }
  assert.equal(checkedCount, 15, "직업 도전과제 15개 전부를 실제 렌더로 확인해야 한다")
})

// ── 화면(.jsx) 배선: 실제 파일 소스에 연결 지점이 있는지 확인한다 ─────────────────

test("AC-06: roleStatistics.store.js가 직업 전적과 함께 업적 조회 결과로 achievementsById를 채운다(current/threshold/granted 보존)", () => {
  assertWires("domains/library/store/roleStatistics.store.js", [
    [/import \{ getMyAchievementsApi \} from "\.\.\/api\/achievements\.api\.js"/, "업적 조회 API를 import하지 않는다"],
    [/getMyAchievementsApi\(\)/, "requestJob이 업적 조회를 함께 부르지 않는다"],
    [/achievementsById = Object\.fromEntries\(\s*achievements\.map\(\(a\) => \[a\.id, \{ achieved: a\.achieved, current: a\.current, threshold: a\.threshold, granted: a\.granted \}\]\),\s*\)/, "achieved·current·threshold만 남기고 granted를 버리면 안 된다(CODEX-2 재검토)"],
    [/\[jobKey\]: \{ status: "success", myStats, ranking: rankingResponse\.ranking, error: null, achievementsById \}/, "job 상태에 achievementsById를 함께 저장하지 않는다"],
  ])
})

test("AC-06: mergeInvitedGuestsSpreads.js가 cleared를 achieved가 아니라 granted(실제 지급 이력)로 판정한다", () => {
  assertWires("domains/library/content/invitedGuests/mergeInvitedGuestsSpreads.js", [
    [/cleared: progress\?\.granted \?\? false/, "cleared가 achieved가 아니라 granted로 판정돼야 한다(CODEX-2 재검토)"],
  ])
})

test("AC-01/AC-06: ForbiddenRecordsRightPage.jsx가 개발용 더미 대신 useAchievements 서버 상태를 쓰고, resolveForbiddenRecordChallengeState로 클리어·진행률을 계산한다", () => {
  assertWires("domains/library/components/forbiddenRecords/ForbiddenRecordsRightPage.jsx", [
    [/import \{ useAchievements \} from "[^"]*useAchievements\.js"/, "useAchievements 훅을 import하지 않는다"],
    [/import \{ resolveForbiddenRecordChallengeState \} from "[^"]*resolveForbiddenRecordChallengeState\.js"/, "실제 실행 가능한 순수 함수로 클리어·진행률을 계산하지 않는다(CODEX-2 재검토 AC-01)"],
    [/const \{ achievements, status, error \} = useAchievements\(\)/, "훅에서 achievements·status·error를 꺼내지 않는다"],
    [/const achievement = achievements\?\.find\(\(entry\) => entry\.id === id\)/, "spread id로 서버 업적을 찾지 않는다"],
    [/const \{ challengeCleared, displayedProgress \} = resolveForbiddenRecordChallengeState\(\{/, "달성 여부를 순수 함수로 위임하지 않는다"],
    [/progress=\{displayedProgress\}/, "화면에 서버 진행률을 표시하지 않는다"],
  ])
  assert.ok(
    !/forbiddenRecordsChallengeDevState/.test(readSrc("domains/library/components/forbiddenRecords/ForbiddenRecordsRightPage.jsx")),
    "API 연동 후에도 개발용 더미 오버라이드를 계속 참조하면 안 된다",
  )
})

test("개발용 더미 상태 파일은 API 연동 후 제거되었다(자기 자신의 문서화된 계약)", () => {
  assert.equal(
    existsSync(path.join(srcRoot, "domains/library/content/forbiddenRecords/forbiddenRecordsChallengeDevState.js")),
    false,
    "forbiddenRecordsChallengeDevState.js가 여전히 남아 있다",
  )
})
