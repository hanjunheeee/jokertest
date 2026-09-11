import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

// F-13 AC-06 — 마이페이지에 이모티콘 "진입 버튼만" 추가한다. 버튼 클릭 이후의 탭 내용·
// 모달·장착 슬롯·보유 목록·구매/장착/전송 기능은 이 슬라이스 범위 밖이라 만들지 않는다
// (계획 A-08 반증 조건). EmoticonEntryButton.jsx/MyPageLayout.jsx는 .jsx이고 vite alias를
// 타 이 저장소의 node:test 실행에서는 렌더는커녕 resolve조차 되지 않으므로
// (InGamePlayerCard.playerColor.test.js와 동일한 제약), raw source 검증으로 실제
// production 배선을 증명한다.

const buttonUrl = new URL("../EmoticonEntryButton.jsx", import.meta.url)
const layoutUrl = new URL("../../MyPageLayout.jsx", import.meta.url)

test("EmoticonEntryButton은 기존 MyPageFramedButton만 재사용한다(새 탭·모달·슬롯 컴포넌트를 만들지 않는다)", async () => {
  const source = await readFile(buttonUrl, "utf8")
  assert.match(source, /import MyPageFramedButton from ".\/MyPageFramedButton\.jsx"/)
  assert.match(source, /<MyPageFramedButton label="이모티콘" onClick=\{onOpenEmoticons\} \/>/)
  // 후속 UI(탭/모달/슬롯/보유 목록)를 암시하는 상태·컴포넌트가 이 파일에 없어야 한다.
  assert.doesNotMatch(source, /useState/)
  assert.doesNotMatch(source, /Modal|Overlay|Panel|Grid/)
})

test("EmoticonEntryButton의 onOpenEmoticons는 선택 값이고 기본값이 아무 것도 하지 않는 no-op이다", async () => {
  const source = await readFile(buttonUrl, "utf8")
  assert.match(source, /onOpenEmoticons\s*=\s*\(\)\s*=>\s*\{\}/, "콜백을 넘기지 않으면 클릭해도 아무 일도 일어나지 않아야 한다")
})

test("MyPageLayout은 EmoticonEntryButton에 onOpenEmoticons를 넘기지 않는다(클릭해도 미연결 상태 유지)", async () => {
  const source = await readFile(layoutUrl, "utf8")
  assert.match(source, /<EmoticonEntryButton \/>/, "콜백 없이 버튼만 렌더해야 한다 — onOpenEmoticons를 넘기면 후속 기능이 연결된 것처럼 보인다")
  assert.doesNotMatch(source, /onOpenEmoticons=/, "MyPageLayout이 onOpenEmoticons를 넘기면 이 슬라이스 범위 밖인 후속 UI가 실제로 열리게 된다")
})

test("MyPageLayout은 프로필 수정·스킨카드 장착과 같은 자리에 이모티콘 버튼을 추가만 했을 뿐, 다른 버튼의 기존 오버레이 배선은 그대로 둔다", async () => {
  const source = await readFile(layoutUrl, "utf8")
  assert.match(source, /<ProfileEditOverlay open=\{profileEditOpen\} onClose=\{\(\) => setProfileEditOpen\(false\)\} \/>/)
  assert.match(source, /<SkinCardWearOverlay open=\{skinCardWearOpen\} onClose=\{\(\) => setSkinCardWearOpen\(false\)\} \/>/)
  // 이모티콘 전용 오버레이/패널은 아직 존재하지 않는다.
  assert.doesNotMatch(source, /Emoticon.*Overlay|Emoticon.*Panel|emoticonOpen/i)
})
