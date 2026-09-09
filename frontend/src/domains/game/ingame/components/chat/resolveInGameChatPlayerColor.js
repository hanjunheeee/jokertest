import { INGAME_PLAYER_THEME_TEXT_RENDER_CLASS } from "../../constants/ingamePlayerTheme.js"

/**
 * 채팅 행이 발신자·본문에 실제로 쓰는 색 스타일·클래스 — themeStyles(세션이
 * colorIndex를 해석한 결과)가 없으면(구세션 등) 색 없이 기본색으로 그린다.
 * @param {{ color: string } | null | undefined} themeStyles
 */
export function resolveInGameChatPlayerColor(themeStyles) {
  return {
    style: themeStyles ? { color: themeStyles.color } : undefined,
    className: themeStyles ? INGAME_PLAYER_THEME_TEXT_RENDER_CLASS : "",
  }
}
