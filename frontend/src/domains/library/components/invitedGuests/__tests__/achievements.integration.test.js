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

// ── 순수 함수: mergeInvitedGuestsSpreads가 서버 달성 id로 cleared를 판정한다 ──────

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

test("AC-01: 달성한 업적 id만 해당 직업 도전과제의 cleared:true로 표시된다", () => {
  const pages = mergeInvitedGuestsSpreads(SPREAD_META, CATALOG, CHALLENGES, {
    byJobKey: {
      noble: { status: "success", myStats: null, ranking: [], error: null, clearedChallengeIds: ["noble-win-10"] },
    },
  })

  const noblePage = pages.find((p) => p.jobKey === "noble")
  assert.deepEqual(
    noblePage.right.challenges.map((c) => [c.id, c.cleared]),
    [["noble-win-10", true], ["noble-win-20", false]],
  )
})

test("AC-01: 한 직업의 달성 id가 다른 직업 도전과제를 잘못 클리어시키지 않는다", () => {
  const pages = mergeInvitedGuestsSpreads(SPREAD_META, CATALOG, CHALLENGES, {
    byJobKey: {
      noble: { status: "success", myStats: null, ranking: [], error: null, clearedChallengeIds: ["noble-win-10"] },
      // clown은 아직 조회 전(idle)이라 clearedChallengeIds가 없다 — 빈 배열로 안전하게 처리돼야 한다.
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

// ── 화면(.jsx) 배선: 실제 파일 소스에 연결 지점이 있는지 확인한다 ─────────────────

test("AC-06: roleStatistics.store.js가 직업 전적과 함께 업적 조회 결과로 clearedChallengeIds를 채운다", () => {
  assertWires("domains/library/store/roleStatistics.store.js", [
    [/import \{ getMyAchievementsApi \} from "\.\.\/api\/achievements\.api\.js"/, "업적 조회 API를 import하지 않는다"],
    [/getMyAchievementsApi\(\)/, "requestJob이 업적 조회를 함께 부르지 않는다"],
    [/clearedChallengeIds = achievements\.filter\(\(a\) => a\.achieved\)\.map\(\(a\) => a\.id\)/, "달성한 업적 id만 clearedChallengeIds로 뽑지 않는다"],
    [/\[jobKey\]: \{ status: "success", myStats, ranking: rankingResponse\.ranking, error: null, clearedChallengeIds \}/, "job 상태에 clearedChallengeIds를 함께 저장하지 않는다"],
  ])
})

test("AC-01/AC-06: ForbiddenRecordsRightPage.jsx가 개발용 더미 대신 useAchievements 서버 상태를 쓴다", () => {
  assertWires("domains/library/components/forbiddenRecords/ForbiddenRecordsRightPage.jsx", [
    [/import \{ useAchievements \} from "[^"]*useAchievements\.js"/, "useAchievements 훅을 import하지 않는다"],
    [/const \{ achievements \} = useAchievements\(\)/, "훅에서 achievements를 꺼내지 않는다"],
    [/const achievement = achievements\?\.find\(\(entry\) => entry\.id === id\)/, "spread id로 서버 업적을 찾지 않는다"],
    [/const challengeCleared = achievement\?\.achieved \?\? false/, "달성 여부를 서버 achieved 값으로 판정하지 않는다"],
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
