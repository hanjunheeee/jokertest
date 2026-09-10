import assert from "node:assert/strict"
import test from "node:test"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

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

// ── 순수 함수: mergeInvitedGuestsSpreads가 서버 달성 id로 cleared·진행률을 판정한다 ──

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

test("AC-01: 달성한 업적 id만 해당 직업 도전과제의 cleared:true로 표시되고, current·threshold도 함께 전달된다(CODEX-1 재검토)", () => {
  const pages = mergeInvitedGuestsSpreads(SPREAD_META, CATALOG, CHALLENGES, {
    byJobKey: {
      noble: {
        status: "success", myStats: null, ranking: [], error: null,
        achievementsById: {
          "noble-win-10": { achieved: true, current: 12, threshold: 10 },
          "noble-win-20": { achieved: false, current: 12, threshold: 20 },
        },
      },
    },
  })

  const noblePage = pages.find((p) => p.jobKey === "noble")
  assert.deepEqual(
    noblePage.right.challenges.map((c) => [c.id, c.cleared, c.current, c.threshold]),
    [["noble-win-10", true, 12, 10], ["noble-win-20", false, 12, 20]],
  )
})

test("AC-01: 한 직업의 달성 id가 다른 직업 도전과제를 잘못 클리어시키지 않는다", () => {
  const pages = mergeInvitedGuestsSpreads(SPREAD_META, CATALOG, CHALLENGES, {
    byJobKey: {
      noble: { status: "success", myStats: null, ranking: [], error: null, achievementsById: { "noble-win-10": { achieved: true, current: 10, threshold: 10 } } },
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

test("AC-01: 실제 INVITED_GUESTS_JOB_CHALLENGES 15개 전부가 label·rewards 원문을 유지한 채 서버 달성 id로 cleared된다", () => {
  const allJobIds = Object.values(INVITED_GUESTS_JOB_CHALLENGES).flatMap((list) => list.map((c) => c.id))
  assert.equal(allJobIds.length, 15, "직업 도전과제는 5직업 × 3단계 = 15개여야 한다")

  // 이번 라운드에 각 직업의 win-10만 달성했다고 가정한다 — 나머지(win-20/30)는 미달성으로 남아야 한다.
  const achievedIds = new Set(allJobIds.filter((id) => id.endsWith("-win-10")))
  const byJobKey = Object.fromEntries(
    Object.keys(INVITED_GUESTS_JOB_CHALLENGES).map((jobKey) => [
      jobKey,
      {
        status: "success", myStats: null, ranking: [], error: null,
        achievementsById: Object.fromEntries(
          INVITED_GUESTS_JOB_CHALLENGES[jobKey].map((c) => [c.id, { achieved: achievedIds.has(c.id), current: 0, threshold: 0 }]),
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
      assert.equal(merged.cleared, achievedIds.has(source.id), `${source.id}: cleared가 서버 달성 여부와 달라야 할 이유가 없다`)
      checkedCount += 1
    })
  }
  assert.equal(checkedCount, 15, "직업 도전과제 15개 전부를 확인해야 한다")
})

// ── 화면(.jsx) 배선: 실제 파일 소스에 연결 지점이 있는지 확인한다 ─────────────────

test("AC-06: roleStatistics.store.js가 직업 전적과 함께 업적 조회 결과로 achievementsById를 채운다(current/threshold 보존)", () => {
  assertWires("domains/library/store/roleStatistics.store.js", [
    [/import \{ getMyAchievementsApi \} from "\.\.\/api\/achievements\.api\.js"/, "업적 조회 API를 import하지 않는다"],
    [/getMyAchievementsApi\(\)/, "requestJob이 업적 조회를 함께 부르지 않는다"],
    [/achievementsById = Object\.fromEntries\(\s*achievements\.map\(\(a\) => \[a\.id, \{ achieved: a\.achieved, current: a\.current, threshold: a\.threshold \}\]\),\s*\)/, "achieved만 남기고 current·threshold를 버리면 안 된다"],
    [/\[jobKey\]: \{ status: "success", myStats, ranking: rankingResponse\.ranking, error: null, achievementsById \}/, "job 상태에 achievementsById를 함께 저장하지 않는다"],
  ])
})

test("AC-01/AC-06: ForbiddenRecordsRightPage.jsx가 개발용 더미 대신 useAchievements 서버 상태를 쓰고, 로딩·오류 중엔 계정 무관 더미 진행률을 보여주지 않는다", () => {
  assertWires("domains/library/components/forbiddenRecords/ForbiddenRecordsRightPage.jsx", [
    [/import \{ useAchievements \} from "[^"]*useAchievements\.js"/, "useAchievements 훅을 import하지 않는다"],
    [/const \{ achievements, status, error \} = useAchievements\(\)/, "훅에서 achievements·status·error를 꺼내지 않는다"],
    [/const achievement = achievements\?\.find\(\(entry\) => entry\.id === id\)/, "spread id로 서버 업적을 찾지 않는다"],
    [/const challengeCleared = achievement\?\.achieved \?\? false/, "달성 여부를 서버 achieved 값으로 판정하지 않는다"],
    [/status === "loading"/, "로딩 중 더미 진행률을 그대로 보여주면 안 된다(CODEX-1 AC-06 재검토)"],
    [/status === "error"/, "오류 상태에서도 더미 진행률을 그대로 보여주면 안 된다(CODEX-1 AC-06 재검토)"],
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
