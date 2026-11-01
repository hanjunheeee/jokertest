// 채팅 틀 그림 기준 자리를 화면 자리(%)로 바꾸기
// 판 위 채팅·크게 보기·채팅 레이아웃 상수가 사용
import { INGAME_CHAT_FRAME_SCALE } from "./ingameChatAssets.js"

// 내용 왼쪽 시작을 더 미는 값 (틀 기준 %)
export const CONTENT_SHIFT_LEFT_FRAME = 7

// 틀 기준 자리(top·bottom·left·right·height)를 배율 맞춰 % 글로 바꿈
export function mapFrameInsetToLayoutBox(
  inset,
  scale = INGAME_CHAT_FRAME_SCALE,
) {
  // 배율로 줄어든 만큼 위·오른쪽을 띄움
  const gap = (1 - scale) * 100
  const mapped = {}

  // 들어온 칸만 바꿈
  if (inset.top != null) mapped.top = `${gap + inset.top * scale}%`
  if (inset.bottom != null) mapped.bottom = `${inset.bottom * scale}%`
  if (inset.left != null) mapped.left = `${inset.left * scale}%`
  if (inset.right != null) mapped.right = `${gap + inset.right * scale}%`
  if (inset.height != null) mapped.height = `${inset.height * scale}%`

  return mapped
}
