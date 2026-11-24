// 로비 메뉴 버튼 하나 (패널 그림 + 글자)
// MenuNav가 씀 — 데스크톱 메뉴 webp 대신 모바일 패널 2종
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import {
  LOBBY_MOBILE_MENU_ACTIVE_ID,
  LOBBY_MOBILE_MENU_PANELS,
} from "@m/domains/lobby/constants/lobbyMobileMenuAssets.js"
import {
  LOBBY_MOBILE_MENU_BTN_CLASS,
  LOBBY_MOBILE_MENU_LABEL_ACTIVE_CLASS,
  LOBBY_MOBILE_MENU_LABEL_CLASS,
  LOBBY_MOBILE_MENU_PANEL_IMG_CLASS,
} from "@m/domains/lobby/constants/lobbyMobileMenuStyle.js"

export default function MenuItemButton({ item, onSelect }) {
  const panel =
    item.id === LOBBY_MOBILE_MENU_ACTIVE_ID
      ? LOBBY_MOBILE_MENU_PANELS.active
      : LOBBY_MOBILE_MENU_PANELS.inactive

  return (
    <button type="button" aria-label={item.label} onClick={() => onSelect(item.id)} className={LOBBY_MOBILE_MENU_BTN_CLASS}>
      <PublicAsset src={panel} alt="" aria-hidden="true" className={LOBBY_MOBILE_MENU_PANEL_IMG_CLASS} />
      <span
        className={`${LOBBY_MOBILE_MENU_LABEL_CLASS} ${
          item.id === LOBBY_MOBILE_MENU_ACTIVE_ID ? LOBBY_MOBILE_MENU_LABEL_ACTIVE_CLASS : ""
        }`}
      >
        {item.label}
      </span>
    </button>
  )
}
