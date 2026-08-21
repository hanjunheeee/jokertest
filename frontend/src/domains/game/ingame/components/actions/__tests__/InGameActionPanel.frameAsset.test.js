import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

const componentUrl = new URL("../InGameActionPanel.jsx", import.meta.url)
const voteAssetsUrl = new URL("../../../constants/vote/ingameVoteAssets.js", import.meta.url)

/**
 * InGameActionPanel.jsx는 .jsx라서 이 저장소의 node:test 실행에는 JSX 로더가 없어 직접
 * 렌더링할 수 없다(InGameActionPanel.productionSource.test.js 주석 참고). 대신 production
 * 컴포넌트 소스 → 실제 임포트하는 에셋 상수 파일까지 체인을 추적해서, 진짜 리터럴 PNG 경로
 * "/frame/투표현황창 프레임.png"가 화면에 그려지는 <PublicAsset>의 src까지 실제로 이어지는지
 * 증명한다 — 상수/헬퍼 하나만 보고 끝내지 않는다.
 */

test("컨트롤 패널은 INGAME_VOTE_ASSETS.panelFrame과 PublicAsset을 import한다", async () => {
  const source = await readFile(componentUrl, "utf8")
  assert.match(
    source,
    /import \{ INGAME_VOTE_ASSETS \} from "..\/..\/constants\/vote\/ingameVoteAssets\.js"/,
  )
  assert.match(source, /import PublicAsset from "@\/shared\/ui\/PublicAsset\.jsx"/)
})

test("INGAME_VOTE_ASSETS.panelFrame 리터럴 값은 실제 존재하는 자산 경로 \"/frame/투표현황창 프레임.png\"다", async () => {
  const assetsSource = await readFile(voteAssetsUrl, "utf8")
  assert.match(
    assetsSource,
    /panelFrame:\s*"\/frame\/투표현황창 프레임\.png"\.normalize\("NFD"\)/,
  )
})

test("compact/expanded 두 렌더 경로 모두 <PublicAsset src={INGAME_VOTE_ASSETS.panelFrame}>를 프레임으로 렌더한다(빈 gameState 대기 화면 포함)", async () => {
  const source = await readFile(componentUrl, "utf8")
  const frameUsages = source.match(
    /<PublicAsset\s+src=\{INGAME_VOTE_ASSETS\.panelFrame\}/g,
  )
  assert.notEqual(frameUsages, null, "PublicAsset이 panelFrame을 src로 쓰는 곳을 찾을 수 없다")
  assert.equal(
    frameUsages.length,
    2,
    "gameState 대기 화면과 실제 게임 화면 둘 다 같은 PNG 프레임을 써야 한다",
  )
})

test("프레임 이미지는 CONTROL_PANEL_FRAME_IMAGE_CLASS로 렌더되고, object-contain으로 비율을 지키며 늘리거나 잘라내지 않는다", async () => {
  const source = await readFile(componentUrl, "utf8")
  assert.match(
    source,
    /CONTROL_PANEL_FRAME_IMAGE_CLASS\s*=\s*\n?\s*"[^"]*object-contain[^"]*"/,
  )
  assert.doesNotMatch(source, /CONTROL_PANEL_FRAME_IMAGE_CLASS[\s\S]*?object-cover/)
  const frameImageBlocks = source.match(/<PublicAsset[\s\S]*?className=\{CONTROL_PANEL_FRAME_IMAGE_CLASS\}/g)
  assert.notEqual(frameImageBlocks, null)
  assert.equal(frameImageBlocks.length, 2)
})

test("compact/expanded 크기 클래스 둘 다 같은 aspect-[734/601] 프레임 비율을 쓴다 — 같은 시각적 정체성 유지", async () => {
  const source = await readFile(componentUrl, "utf8")
  assert.match(source, /CONTROL_PANEL_COMPACT_SIZE_CLASS\s*=\s*\n?\s*"[^"]*aspect-\[734\/601\][^"]*"/)
  assert.match(source, /CONTROL_PANEL_EXPANDED_SIZE_CLASS\s*=\s*\n?\s*"[^"]*aspect-\[734\/601\][^"]*"/)
})

test("옛 투표현황 팝업 컴포넌트(InGameVoteStatusPanel/InGameVoteToggleButton)는 컨트롤 패널에서 더 이상 참조되지 않는다", async () => {
  const source = await readFile(componentUrl, "utf8")
  assert.doesNotMatch(source, /InGameVoteStatusPanel/)
  assert.doesNotMatch(source, /InGameVoteToggleButton/)
})

test("프레임 이미지는 조작 UI 콘텐츠와 나란히 있는 장식이 아니라, 같은 relative wrap 안에서 콘텐츠 레이어 바로 아래(z-1)에 겹쳐진다(z-2)", async () => {
  const source = await readFile(componentUrl, "utf8")
  assert.match(source, /CONTROL_PANEL_FRAME_WRAP_CLASS\s*=\s*"relative[^"]*"/)
  assert.match(source, /CONTROL_PANEL_FRAME_IMAGE_CLASS\s*=\s*\n?\s*"[^"]*absolute inset-0 z-\[1\][^"]*"/)
  assert.match(source, /CONTROL_PANEL_CONTENT_WRAP_CLASS\s*=\s*"absolute z-\[2\][^"]*"/)
})
