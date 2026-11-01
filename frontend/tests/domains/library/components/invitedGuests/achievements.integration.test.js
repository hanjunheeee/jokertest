import assert from "node:assert/strict"
import test from "node:test"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createElement } from "react"
import { JSDOM } from "jsdom"
import { cleanup, render } from "@testing-library/react"
import { publicAsset } from "../../../../../src/shared/utils/publicAsset.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const srcRoot = path.resolve(here, "..", "..", "..", "..", "..", "src")

function readSrc(relativePath) {
  return readFileSync(path.join(srcRoot, relativePath), "utf8")
}

function assertWires(relativePath, patterns) {
  const source = readSrc(relativePath)
  for (const [pattern, why] of patterns) {
    assert.match(source, pattern, `${relativePath}: ${why}`)
  }
}

const { mergeInvitedGuestsSpreads } = await import("../../../../../src/domains/library/content/invitedGuests/mergeInvitedGuestsSpreads.js")
const { INVITED_GUESTS_JOB_CHALLENGES } = await import("../../../../../src/domains/library/content/invitedGuests/jobChallenges.js")
const { INVITED_GUESTS_JOB_SPREAD_META } = await import("../../../../../src/domains/library/content/invitedGuests/jobSpreadMeta.js")
const { INVITED_GUESTS_JOB_CATALOG } = await import("../../../../../src/domains/library/content/invitedGuests/jobCatalog.js")
const { FORBIDDEN_RECORDS_SPREAD_META } = await import("../../../../../src/domains/library/content/forbiddenRecords/spreadMeta.js")
const { resolveForbiddenRecordChallengeState } = await import("../../../../../src/domains/library/content/forbiddenRecords/resolveForbiddenRecordChallengeState.js")

const { default: ForbiddenRecordsUnlockCondition } = await import("../../../../../src/domains/library/components/forbiddenRecords/ForbiddenRecordsUnlockCondition.js")
const { default: InvitedGuestsChallengeRow } = await import("../../../../../src/domains/library/components/invitedGuests/shared/InvitedGuestsChallengeRow.js")

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

test("AC-01/AC-06: 실제 INVITED_GUESTS_JOB_CHALLENGES 15개 전부가 label·rewards 원문을 유지한 채 서버 지급 id로 cleared된다", () => {
  const allJobIds = Object.values(INVITED_GUESTS_JOB_CHALLENGES).flatMap((list) => list.map((c) => c.id))
  assert.equal(allJobIds.length, 15, "직업 도전과제는 5직업 × 3단계 = 15개여야 한다")

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
      assert.equal(merged.id, source.id)
      assert.equal(merged.label, source.label)
      assert.deepEqual(merged.rewards, source.rewards)
      assert.equal(merged.cleared, grantedIds.has(source.id), `${source.id}: cleared가 서버 지급 여부와 달라야 할 이유가 없다`)
      checkedCount += 1
    })
  }
  assert.equal(checkedCount, 15, "직업 도전과제 15개 전부를 확인해야 한다")
})

test("AC-01/AC-06: 실제 FORBIDDEN_RECORDS_SPREAD_META 7개 전부가 unlockCondition·unlockRewards·progressUnit 원문을 유지한 채 서버 지급 상태로 cleared·진행률이 계산된다", () => {
  assert.equal(FORBIDDEN_RECORDS_SPREAD_META.length, 7, "금지된 기록은 7개여야 한다")

  let checkedCount = 0
  for (const spread of FORBIDDEN_RECORDS_SPREAD_META) {
    const { unlockCondition, unlockProgress, unlockRewards, progressUnit } = spread.right

    const loading = resolveForbiddenRecordChallengeState({ achievement: null, status: "loading", error: null, unlockProgress, progressUnit })
    assert.equal(loading.challengeCleared, false)
    assert.equal(loading.displayedProgress, "진행률을 불러오는 중…")

    const errored = resolveForbiddenRecordChallengeState({ achievement: null, status: "error", error: "네트워크 오류", unlockProgress, progressUnit })
    assert.equal(errored.displayedProgress, "네트워크 오류")

    const idle = resolveForbiddenRecordChallengeState({ achievement: null, status: "idle", error: null, unlockProgress, progressUnit })
    assert.equal(idle.displayedProgress, unlockProgress, "idle 상태에서는 정적 더미 진행률을 그대로 보여줘야 한다(원문 보존)")

    const pending = resolveForbiddenRecordChallengeState({
      achievement: { current: 3, threshold: 3, achieved: true, granted: false }, status: "success", error: null, unlockProgress, progressUnit,
    })
    assert.equal(pending.challengeCleared, false, "achieved여도 granted가 아니면 클리어로 보이면 안 된다(CODEX-2 재검토 AC-06)")
    assert.equal(pending.displayedProgress, `3/3${progressUnit}`, "실제 진행률 문구는 원본 progressUnit 꼬리말을 그대로 써야 한다")

    const granted = resolveForbiddenRecordChallengeState({
      achievement: { current: 3, threshold: 3, achieved: true, granted: true }, status: "success", error: null, unlockProgress, progressUnit,
    })
    assert.equal(granted.challengeCleared, true)

    assert.equal(typeof unlockCondition, "string")
    assert.ok(Array.isArray(unlockRewards) && unlockRewards.length > 0)

    checkedCount += 1
  }
  assert.equal(checkedCount, 7, "금지된 기록 7개 전부를 확인해야 한다")
})

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
        assert.equal(
          document.body.textContent.includes(unlockCondition),
          true,
          `${spread.id}: unlockCondition 원문("${unlockCondition}")이 실제 렌더 DOM에 없다`,
        )
        assert.equal(
          document.body.textContent.includes(`1/3${progressUnit}`),
          true,
          `${spread.id}: 진행률 문구가 실제 DOM에 없다`,
        )
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

test("AC-01: INVITED_GUESTS_JOB_CHALLENGES 15개 전부가 실제 렌더된 DOM에 label·rewards 원문을 유지하고, cleared 여부에 따라 다른 실제 DOM을 그린다", () => {
  ensureClientEnvironment()
  let checkedCount = 0
  try {
    for (const jobKey of Object.keys(INVITED_GUESTS_JOB_CHALLENGES)) {
      for (const challenge of INVITED_GUESTS_JOB_CHALLENGES[jobKey]) {
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
