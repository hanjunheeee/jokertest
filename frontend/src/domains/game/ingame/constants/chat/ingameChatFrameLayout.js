import { INGAME_CHAT_FRAME_SCALE } from "./ingameChatAssets.js"

export const INGAME_CHAT_CONTENT_SHIFT_LEFT_FRAME = 7

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
