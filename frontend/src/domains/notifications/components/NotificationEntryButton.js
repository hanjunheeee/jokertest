// 파일 역할: NotificationEntryButton.js - 로비 우하단 알림 모달 진입 버튼입니다.
//
// 로비 우측 제어 영역(LOBBY_RIGHT_CONTROLS_CLASS)에서 친구 목록 버튼과 같은 자리·같은
// hover 규칙(LOBBY_RIGHT_ACTION_BTN_CLASS)을 쓴다. **확인된 벨 아이콘 자산이 없으므로**
// 새 이미지를 있다고 가정하지 않고 글자 라벨로 그린다(AC-06). 미확인 수는 라벨 옆 배지로
// 표시하며, 표시 설정으로 가려진 알림은 세지 않는다(AC-04).
//
// createElement로만 구현해 .js 시험이 그대로 import할 수 있게 한다(파치먼트 셸과 같은 이유).
import { createElement } from "react"

import { LOBBY_RIGHT_ACTION_BTN_CLASS } from "../../lobby/constants/lobbyLayoutStyle.js"
import { useNotificationsStore, selectUnreadCount } from "../store/notifications.store.js"
import { useSettingsStore } from "../../settings/store/settingsStore.js"

// F-15(AC-02): 인게임 밖 화면이므로 명시적 font-size는 배율 경로(app-text-scaled +
// --app-text-size)를 지난다.
const BUTTON_CLASS =
  `${LOBBY_RIGHT_ACTION_BTN_CLASS} relative mr-[clamp(1rem,1.75vw,1.35rem)] rounded-sm border border-[#6b4321] bg-black/45 px-[clamp(0.45rem,1.2vw,0.7rem)] py-[clamp(0.15rem,0.5vw,0.3rem)] font-subheading app-text-scaled [--app-text-size:clamp(0.68rem,1.5vw,0.82rem)] text-white`

// 배지는 버튼 글자 크기를 그대로 상속한다(자체 font-size 선언 없음) — 배율이 버튼에만
// 적용되고 배지는 고정되는 어긋남을 만들지 않는다.
const BADGE_CLASS =
  "ml-1 inline-flex min-w-[1.4em] items-center justify-center rounded-full bg-[#8a2b12] px-1 font-bold leading-tight text-white"

/** 두 자리를 넘는 수는 99+로 줄인다 — 버튼 폭이 레이아웃을 밀지 않게 한다. */
function formatUnread(count) {
  return count > 99 ? "99+" : String(count)
}

/**
 * @param {object} props
 * @param {() => void} props.onOpen 알림 모달을 연다.
 * @param {boolean} [props.open] 열려 있는지(aria-expanded).
 */
export default function NotificationEntryButton({ onOpen, open = false }) {
  const items = useNotificationsStore((state) => state.items)
  const generalChecks = useSettingsStore((state) => state.generalChecks)

  const unread = selectUnreadCount(items, generalChecks)

  return createElement(
    "button",
    {
      type: "button",
      // 수를 라벨에도 실어 배지를 읽지 못하는 보조 기술에서도 미확인 여부를 알 수 있게 한다.
      "aria-label": unread > 0 ? `알림 (읽지 않음 ${unread}개)` : "알림",
      "aria-expanded": open,
      className: BUTTON_CLASS,
      style: { outline: "none" },
      "data-notification-entry": "true",
      "data-notification-unread-count": String(unread),
      onClick: onOpen,
    },
    "알림",
    unread > 0
      ? createElement("span", { className: BADGE_CLASS, "aria-hidden": "true" }, formatUnread(unread))
      : null,
  )
}
