// 채팅 줄 이름 띠: 이름에만 플레이어 테마 색 + 색에 맞는 띠 (말은 기본 글자색)
// PC 채팅 줄(InGameChatMessageRow)·모바일 채팅 줄(MessageRow·TribunalChatRow·TalkBubble)이 씀, 띠 색 고르기는 카드 이름판과 같은 nameplateBand.js
import { THEME_TEXT_RENDER_CLASS, THEME_TEXT_SHADOW } from "../../../../shared/constants/ingamePlayerTheme.js"
import { buildNameplateBand } from "./nameplateBand.js"

// 죽은 사람 줄 이름 색 (회색, 산 사람 줄과 구분하던 색 그대로, 띠 위라 읽힘)
export const DEAD_CHAT_NAME_COLOR = "#a9a9a9"

// 이름 띠 모양: 글 높이에 맞는 얇은 알약, 줄 높이·줄 바꿈이 안 바뀌게 inline에 위아래 여백 없음
export const CHAT_NAME_BAND_CLASS =
  `rounded-full px-[0.3em] [box-decoration-break:clone] [-webkit-box-decoration-break:clone] ${THEME_TEXT_RENDER_CLASS}`

// 이름 띠 값: 테마 있고 닉네임 색 설정 켜졌을 때 그 색, 죽은 사람 줄은 설정과 상관없이 회색, 아니면 null(띠 없이 기본색)
// 플레이어 색 10가지가 양피지 위에서 안 읽혀서 카드 이름판과 같은 띠를 깖 (결정 2026-11-16 밤)
// 예: ({ color: "#ffffff" }, true) → { kind: "dark", style: { color: "#ffffff", textShadow: "0 1px 2px …", backgroundColor: "rgba(0, 0, 0, 0.8)" } }
export function resolveChatNameBand(themeStyles, nicknameColorEnabled, { dead = false } = {}) {
  const themeColor = themeStyles && nicknameColorEnabled ? themeStyles.color ?? null : null
  const color = dead ? DEAD_CHAT_NAME_COLOR : themeColor
  if (!color) return null

  const band = buildNameplateBand(color)
  return {
    kind: band.kind,
    style: { color, textShadow: THEME_TEXT_SHADOW, ...band.style },
  }
}
