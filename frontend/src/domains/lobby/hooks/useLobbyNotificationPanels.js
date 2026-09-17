// 파일 역할: useLobbyNotificationPanels.js - 로비의 알림 모달·친구 패널 열림 상태를 한곳에서
// 소유합니다(F-17 AC-02/AC-05).
//
// 두 가지를 고치기 위해 LobbyPage에서 분리했습니다(R-IMPL #3):
//
//   1) **모달 열림 상태의 소유자를 하나로 만든다.** 예전에는 LobbyPage가 지역 useState로
//      열림 여부를 들고 있어서, 계정이 바뀔 때 알림 store(syncAccount)가 자기 open만
//      false로 내려도 화면의 모달은 그대로 열려 있었다. 이제 열림 여부는 store가 소유하고
//      화면은 구독만 한다 — 계정 전환·로그아웃이 목록과 모달을 **함께** 정리한다.
//
//   2) **같은 알림으로 다시 들어올 때도 친구 패널이 다시 열린다.** 대상 이동은
//      /lobby?notificationRequestId=<원본 id>로 들어오는데, 사용자가 그 패널을 닫고 같은
//      알림을 다시 누르면 URL 질의가 그대로여서 searchParams가 바뀌지 않는다. 그래서
//      "이동이 일어났다"는 사실 자체를 명시적 입력(이동 신호)으로 올려 재진입을 감지한다.
//
// JSX가 없는 .js인 이유는 이 저장소의 프런트 시험이 변환기 없이 node --test로 돌기 때문이다
// — 실제 소비처 계약을 시험에서 그대로 마운트해 확인해야 한다(NotificationModal.js와 같다).
import { useCallback, useEffect, useState } from "react"

import { useNotificationsStore } from "../../notifications/store/notifications.store.js"
import {
  NOTIFICATION_FRIEND_REQUEST_PARAM,
  NOTIFICATION_GAME_INVITE_PARAM,
} from "../../notifications/constants/notificationTargets.js"

/**
 * ?notificationRequestId=<양의 정수>만 대상으로 인정한다. 이 값으로 요청을 새로 만들거나
 * 자동 수락하지 않는다 — 실제 incomingRequests에서 같은 request_id를 찾아 그 행을 가리킬
 * 뿐이고, 처리된 요청이면 패널이 "처리됨·대상 없음"을 안내한다(AC-02).
 */
export function parseFriendRequestTargetId(searchParams) {
  const raw = typeof searchParams?.get === "function"
    ? searchParams.get(NOTIFICATION_FRIEND_REQUEST_PARAM)
    : null
  return /^\d+$/.test(raw ?? "") ? Number(raw) : null
}

/**
 * F-19(AC-07): ?gameInviteId=<서버 초대 id>만 대상으로 인정한다.
 *
 * 친구 요청과 같은 계약이다 — 이 값으로 초대를 새로 만들거나 **자동 수락하지 않는다**.
 * 실제 초대 목록에서 같은 id를 찾아 그 행을 가리킬 뿐이고, 종료·없는 초대면 패널이
 * "더 이상 유효하지 않다"를 표시한다.
 */
export function parseGameInviteTargetId(searchParams) {
  const raw = typeof searchParams?.get === "function"
    ? searchParams.get(NOTIFICATION_GAME_INVITE_PARAM)
    : null
  return typeof raw === "string" && raw.length > 0 ? raw : null
}

/**
 * @param {object} params
 * @param {{ get: (key: string) => string|null }} [params.searchParams] 라우터가 준 질의 인자.
 * @param {(path: string) => void} [params.navigate] 앱 내부 이동(라우터는 호출부가 소유).
 */
export function useLobbyNotificationPanels({ searchParams, navigate } = {}) {
  // 열림 여부의 유일한 소유자는 알림 store다(위 1번).
  const notificationsOpen = useNotificationsStore((state) => state.open)

  // 친구 패널은 로비 지역 상태로 남긴다 — 알림과 무관한 기존 토글 버튼도 같은 상태를 쓴다.
  const [friendListOpen, setFriendListOpen] = useState(false)

  // 대상 이동이 일어난 횟수. 값 자체는 의미가 없고 "또 들어왔다"는 신호로만 쓴다(위 2번).
  const [friendRequestOpenSignal, setFriendRequestOpenSignal] = useState(0)

  const friendRequestTargetId = parseFriendRequestTargetId(searchParams)
  const gameInviteTargetId = parseGameInviteTargetId(searchParams)

  useEffect(() => {
    if (friendRequestTargetId === null && gameInviteTargetId === null) return
    setFriendListOpen(true)
  }, [friendRequestTargetId, gameInviteTargetId, friendRequestOpenSignal])

  const openNotifications = useCallback(() => {
    useNotificationsStore.getState().openModal()
  }, [])

  const closeNotifications = useCallback(() => {
    useNotificationsStore.getState().closeModal()
  }, [])

  const openFriendList = useCallback(() => setFriendListOpen(true), [])
  const closeFriendList = useCallback(() => setFriendListOpen(false), [])

  const handleNotificationNavigate = useCallback((path) => {
    // 이동하면 모달은 닫는다. 읽음 확정은 모달이 이미 끝냈고(실패면 여기 오지 않는다),
    // SFX completion은 기다리지 않는다(A-06).
    useNotificationsStore.getState().closeModal()
    setFriendRequestOpenSignal((signal) => signal + 1)
    navigate?.(path)
  }, [navigate])

  return {
    notificationsOpen,
    openNotifications,
    closeNotifications,
    friendListOpen,
    openFriendList,
    closeFriendList,
    friendRequestTargetId,
    gameInviteTargetId,
    handleNotificationNavigate,
  }
}
