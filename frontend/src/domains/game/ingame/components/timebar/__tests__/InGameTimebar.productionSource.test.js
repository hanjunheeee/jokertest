import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

const componentUrl = new URL("../InGameTimebar.jsx", import.meta.url)

/**
 * InGameTimebar.jsx는 .jsx라서 이 저장소의 node:test 실행에는 로더가 없어 직접 렌더링할 수
 * 없다(InGameActionPanel.productionSource.test.js와 동일한 제약). raw source 검증으로 옛
 * "투표 현황" 트리거 배선이 완전히 제거됐는지 증명한다.
 */

test("InGameTimebar는 옛 투표현황 토글 버튼(InGameVoteToggleButton)을 더 이상 import/렌더링하지 않는다", async () => {
  const source = await readFile(componentUrl, "utf8")
  assert.doesNotMatch(source, /InGameVoteToggleButton/)
  assert.doesNotMatch(source, /onVoteStatusClick/)
})
