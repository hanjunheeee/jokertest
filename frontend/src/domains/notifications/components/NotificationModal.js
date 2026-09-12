// 파일 역할: NotificationModal.js - F-17 알림 목록 모달입니다.
//
// 기존 인게임 파치먼트 셸(InGameParchmentModalBase)을 그대로 쓴다 — 양피지 배경
// (/frame/양피지 모달.png) · 긍정 버튼 그림 · backdrop · Escape · 이미지 실패 시 대체
// 패널까지 전부 이미 검증된 리소스다. 확인하지 않은 별도 알림 자산을 있다고 가정하지
// 않는다(AC-06).
//
// JSX가 아니라 createElement로 쓰여 있는 이유는 InGameParchmentPanelBase.js와 같다:
// 이 저장소의 프런트엔드 시험은 변환기 없이 node --test로 곧장 돌아가므로, 실제 화면
// DOM을 검증해야 하는 컴포넌트는 시험이 그대로 import할 수 있는 .js여야 한다.
//
// 이 컴포넌트는 소켓을 구독하지 않는다(수신은 useNotificationSocketEvents가 소유한다).
// 여는 것만으로 전체를 읽음 처리하지 않는다 — 읽음은 항목별 조작에서만 일어난다(AC-02).
import { createElement, useEffect, useRef } from "react"

import InGameParchmentModalBase from "../../game/ingame/components/parchment/InGameParchmentModalBase.js"
import { useNotificationsStore, selectVisibleNotifications } from "../store/notifications.store.js"
import { useSettingsStore } from "../../settings/store/settingsStore.js"
import { buildNotificationTargetPath, notificationTargetLabel } from "../constants/notificationTargets.js"

// F-15(AC-02): 이 화면은 인게임 밖이므로 명시적 font-size는 반드시 배율 경로
// (app-text-scaled + --app-text-size)를 지나야 한다 — 임의값 글자 크기 유틸리티를 직접
// 쓰면 "텍스트 크기" 설정이 이 모달만 비켜간다(appTextScaleConsumers.test.js가 강제한다).
const HEADING_CLASS =
  "font-heading app-text-scaled [--app-text-size:clamp(0.95rem,2.1vw,1.2rem)] font-bold text-[#3a1a0c]"
const MESSAGE_CLASS =
  "font-body app-text-scaled [--app-text-size:clamp(0.72rem,1.6vw,0.86rem)] text-[#4a2a16]"
const LIST_CLASS = "flex w-full list-none flex-col gap-[clamp(0.35rem,1vw,0.6rem)] p-0 text-left"
const ITEM_CLASS =
  "w-full rounded-sm border border-[#8a6238]/50 bg-[#f6e8c4]/55 px-[clamp(0.5rem,1.4vw,0.8rem)] py-[clamp(0.3rem,0.9vw,0.5rem)]"
const ITEM_TITLE_CLASS =
  "font-subheading app-text-scaled [--app-text-size:clamp(0.78rem,1.7vw,0.92rem)] font-bold text-[#3a1a0c]"
const ITEM_BODY_CLASS =
  "font-body app-text-scaled [--app-text-size:clamp(0.68rem,1.5vw,0.8rem)] text-[#4a2a16]"
const ACTION_ROW_CLASS = "mt-[clamp(0.2rem,0.6vw,0.35rem)] flex flex-wrap gap-[clamp(0.3rem,0.8vw,0.5rem)]"
const ACTION_BUTTON_CLASS =
  "cursor-pointer rounded-sm border border-[#6b4321] bg-transparent px-[clamp(0.35rem,1vw,0.6rem)] py-[2px] font-body app-text-scaled [--app-text-size:clamp(0.66rem,1.4vw,0.76rem)] text-[#3a1a0c]"
const ERROR_CLASS =
  "font-body app-text-scaled [--app-text-size:clamp(0.68rem,1.5vw,0.8rem)] text-[#8a2b12]"

/** 미확인 표시 — 색만으로 구분하지 않도록 문자와 aria-label을 함께 둔다. */
function renderUnreadBadge(unread) {
  if (!unread) return null
  return createElement(
    "span",
    { className: "mr-1 text-[#8a2b12]", "data-notification-unread": "true", "aria-label": "읽지 않음" },
    "●",
  )
}

/**
 * 항목 하나. 열람(읽음만)과 이동(읽음 + 화면 전환)을 나눠 둔다 — 대상이 없는 알림도
 * 열람으로 읽음 처리할 수 있어야 하고, 대상이 있는 알림의 이동이 읽음 실패를 성공처럼
 * 보이게 해서도 안 된다(A-06).
 */
function NotificationItem({ item, pending, error, onRead, onOpenTarget, onClearError }) {
  const unread = !item.readAt
  const path = buildNotificationTargetPath(item.target)
  const targetLabel = notificationTargetLabel(item.target)

  const actions = []
  if (unread) {
    actions.push(
      createElement(
        "button",
        {
          key: "read",
          type: "button",
          className: ACTION_BUTTON_CLASS,
          disabled: pending,
          "data-notification-action": "read",
          onClick: () => onRead(item),
        },
        pending ? "처리 중…" : "열람",
      ),
    )
  }
  if (path !== null) {
    actions.push(
      createElement(
        "button",
        {
          key: "open",
          type: "button",
          className: ACTION_BUTTON_CLASS,
          disabled: pending,
          "data-notification-action": "open-target",
          onClick: () => onOpenTarget(item, path),
        },
        targetLabel ?? "보러 가기",
      ),
    )
  }

  return createElement(
    "li",
    {
      className: ITEM_CLASS,
      "data-notification-id": item.id,
      "data-notification-type": item.type,
      "data-notification-read": unread ? "false" : "true",
    },
    createElement("p", { className: ITEM_TITLE_CLASS }, renderUnreadBadge(unread), item.title),
    createElement("p", { className: ITEM_BODY_CLASS }, item.body),
    actions.length > 0 ? createElement("div", { className: ACTION_ROW_CLASS }, actions) : null,
    error
      ? createElement(
          "div",
          { className: ACTION_ROW_CLASS },
          createElement("p", { className: ERROR_CLASS, role: "alert", "data-notification-read-error": item.id }, error),
          createElement(
            "button",
            {
              type: "button",
              className: ACTION_BUTTON_CLASS,
              "data-notification-action": "retry-read",
              onClick: () => {
                onClearError(item.id)
                onRead(item)
              },
            },
            "다시 시도",
          ),
        )
      : null,
  )
}

/** 조회 상태별 본문. 로딩·실패를 "빈 목록"으로 위장하지 않는다(AC-06). */
function renderBody({ status, error, visible, onRetry, itemProps }) {
  if (status === "error") {
    return createElement(
      "div",
      { className: "flex flex-col items-center gap-2", "data-notification-state": "error" },
      createElement("p", { className: ERROR_CLASS, role: "alert" }, error ?? "알림을 불러오지 못했습니다."),
      createElement(
        "button",
        { type: "button", className: ACTION_BUTTON_CLASS, "data-notification-action": "retry-list", onClick: onRetry },
        "다시 시도",
      ),
    )
  }

  if (status === "idle" || status === "loading") {
    return createElement(
      "p",
      { className: MESSAGE_CLASS, "data-notification-state": "loading" },
      "알림을 불러오는 중입니다.",
    )
  }

  if (visible.length === 0) {
    return createElement(
      "p",
      { className: MESSAGE_CLASS, "data-notification-state": "empty" },
      "표시할 알림이 없습니다.",
    )
  }

  return createElement(
    "ul",
    { className: LIST_CLASS, "data-notification-state": "list" },
    visible.map((item) => createElement(NotificationItem, { key: item.id, item, ...itemProps(item) })),
  )
}

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {(path: string) => void} props.onNavigate 앱 내부 경로로 이동한다(라우터는 호출부가 소유).
 */
export default function NotificationModal({ open, onClose, onNavigate }) {
  const status = useNotificationsStore((state) => state.status)
  const error = useNotificationsStore((state) => state.error)
  const items = useNotificationsStore((state) => state.items)
  const readPendingIds = useNotificationsStore((state) => state.readPendingIds)
  const readErrors = useNotificationsStore((state) => state.readErrors)
  const generalChecks = useSettingsStore((state) => state.generalChecks)

  const restoreFocusRef = useRef(null)
  // 셸의 focusConfirmOnMount는 이 ref로만 초점을 옮긴다 — 넘기지 않으면 모달이 열려도
  // 초점이 바깥에 남아 키보드 사용자가 Tab으로 목록까지 되짚어 와야 한다.
  const confirmButtonRef = useRef(null)

  // 열림 전환 시점의 초점을 **렌더 단계에서** 붙잡는다.
  //
  // effect에서 잡으면 이미 늦다 — React는 자식의 effect를 부모보다 먼저 실행하므로, 셸
  // (InGameParchmentModalBase)의 focusConfirmOnMount가 먼저 확인 버튼으로 초점을 옮긴 뒤에
  // 이 컴포넌트의 effect가 돌아 "원래 요소" 대신 확인 버튼을 기억하게 된다. 그러면 닫은 뒤
  // 이미 사라진 버튼에 초점을 주려다 초점이 문서 맨 앞(body)으로 떨어진다.
  // 여기서 하는 일은 읽기뿐이고 open이 열린 동안 한 번만 실행된다.
  if (open && restoreFocusRef.current === null && typeof document !== "undefined") {
    restoreFocusRef.current = document.activeElement
  }

  // 닫히면 기억해 둔 요소로 초점을 되돌린다. 초점 복구 실패가 닫기를 막지 않는다.
  useEffect(() => {
    if (open) return undefined
    const previous = restoreFocusRef.current
    restoreFocusRef.current = null
    if (previous && typeof previous.focus === "function") {
      try {
        previous.focus()
      } catch {
        // noop
      }
    }
    return undefined
  }, [open])

  if (!open) return null

  const visible = selectVisibleNotifications(items, generalChecks)

  const handleRead = (item) => {
    // 결과를 기다리지 않고 닫아도 되도록 await하지 않는다. store가 pending·오류를 남긴다.
    useNotificationsStore.getState().markRead(item.id)
  }

  const handleOpenTarget = async (item, path) => {
    // 읽음이 서버에서 확정된 뒤에만 이동한다 — 실패했는데 이동만 하면 "읽었다"는 표시가
    // 없는 채로 화면만 바뀌어, 사용자는 읽음 처리가 된 줄 알게 된다(A-06).
    const result = await useNotificationsStore.getState().markRead(item.id)
    if (result?.ok !== true) return
    onNavigate?.(path)
  }

  const itemProps = (item) => ({
    pending: readPendingIds.includes(item.id),
    error: readErrors[item.id] ?? null,
    onRead: handleRead,
    onOpenTarget: handleOpenTarget,
    onClearError: (id) => useNotificationsStore.getState().clearReadError(id),
  })

  return createElement(
    InGameParchmentModalBase,
    {
      variantKey: "notifications",
      // 닫기는 언제나 가능하다 — 조회 실패·읽음 실패·SFX 대기와 무관하다(A-06).
      onDismiss: onClose,
      confirmLabel: "닫기",
      confirmButtonRef,
      wrapperProps: { "data-notification-modal": "true" },
    },
    createElement("p", { className: HEADING_CLASS }, "알림"),
    renderBody({
      status,
      error,
      visible,
      onRetry: () => useNotificationsStore.getState().loadSnapshot(),
      itemProps,
    }),
  )
}
