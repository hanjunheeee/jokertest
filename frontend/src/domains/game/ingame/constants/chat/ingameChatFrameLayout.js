/**
 * 인게임 채팅 프레임 inset 공통 유틸.
 *
 * ingameChatBoardLayout.js·closeup/ingameChatCloseupLayout.js에서 공유합니다.
 */
import { INGAME_CHAT_FRAME_SCALE } from "./ingameChatAssets.js"

/** 보내기 제외 — 목록·입력 우측 시프트 (프레임 left % 가산) */
export const INGAME_CHAT_CONTENT_SHIFT_LEFT_FRAME = 7

/** INGAME_CHAT_FRAME_SCALE 적용 시 레이아웃 박스 % 좌표로 변환 */
export function mapFrameInsetToLayoutBox(
  inset,
  scale = INGAME_CHAT_FRAME_SCALE,
) {
  const gap = (1 - scale) * 100
  const mapped = {}

  if (inset.top != null) mapped.top = `${gap + inset.top * scale}%`
  if (inset.bottom != null) mapped.bottom = `${inset.bottom * scale}%`
  if (inset.left != null) mapped.left = `${inset.left * scale}%`
  if (inset.right != null) mapped.right = `${gap + inset.right * scale}%`
  if (inset.height != null) mapped.height = `${inset.height * scale}%`

  return mapped
}
