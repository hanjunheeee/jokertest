// 로비 알림 창·친구 목록 패널 열림 상태 (주소의 알림 대상 id로 친구 패널 열기)
// LobbyPage·시험이 씀
import { useCallback, useEffect, useState } from "react"

import { useNotificationsStore } from "../../notifications/store/notifications.store.js"
import {
  FRIEND_REQUEST_PARAM,
  GAME_INVITE_PARAM,
} from "../../../shared/constants/notificationTargets.js"

// 주소의 친구 신청 대상 id (숫자만 받음)
export function parseFriendRequestTargetId(searchParams) {
  const raw = typeof searchParams?.get === "function"
    ? searchParams.get(FRIEND_REQUEST_PARAM)
    : null
  return /^\d+$/.test(raw ?? "") ? Number(raw) : null
}

// 주소의 게임 초대 대상 id (빈 글자면 null)
export function parseInviteTargetId(searchParams) {
  const raw = typeof searchParams?.get === "function"
    ? searchParams.get(GAME_INVITE_PARAM)
    : null
  return typeof raw === "string" && raw.length > 0 ? raw : null
}

// 알림 창·친구 패널 열고 닫기와 알림 항목 눌러 이동하기
export function useLobbyNotificationPanels({ searchParams, navigate } = {}) {
  const notificationsOpen = useNotificationsStore((state) => state.open)

  const [friendListOpen, setFriendListOpen] = useState(false)

  const [friendRequestOpenSignal, setFriendRequestOpenSignal] = useState(0)

  const friendRequestTargetId = parseFriendRequestTargetId(searchParams)
  const gameInviteTargetId = parseInviteTargetId(searchParams)

  // 주소에 대상이 있으면 친구 패널을 엶, 같은 주소로 다시 와도 신호 값으로 다시 엶
  useEffect(() => {
    if (friendRequestTargetId === null && gameInviteTargetId === null) return
    setFriendListOpen(true)
  }, [friendRequestTargetId, gameInviteTargetId, friendRequestOpenSignal])

  // 알림 창 열고 닫기는 알림 스토어가 맡음
  const openNotifications = useCallback(() => {
    useNotificationsStore.getState().openModal()
  }, [])

  const closeNotifications = useCallback(() => {
    useNotificationsStore.getState().closeModal()
  }, [])

  // 친구 패널 열고 닫기
  const openFriendList = useCallback(() => setFriendListOpen(true), [])
  const closeFriendList = useCallback(() => setFriendListOpen(false), [])

  // 알림 항목 누름: 알림 창 닫고 신호 올린 뒤 이동
  const handleNotificationNavigate = useCallback((path) => {
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
