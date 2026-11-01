import { useCallback, useEffect, useState } from "react"

import { useNotificationsStore } from "../../notifications/store/notifications.store.js"
import {
  FRIEND_REQUEST_PARAM,
  GAME_INVITE_PARAM,
} from "../../../shared/constants/notificationTargets.js"

export function parseFriendRequestTargetId(searchParams) {
  const raw = typeof searchParams?.get === "function"
    ? searchParams.get(FRIEND_REQUEST_PARAM)
    : null
  return /^\d+$/.test(raw ?? "") ? Number(raw) : null
}

export function parseInviteTargetId(searchParams) {
  const raw = typeof searchParams?.get === "function"
    ? searchParams.get(GAME_INVITE_PARAM)
    : null
  return typeof raw === "string" && raw.length > 0 ? raw : null
}

export function useLobbyNotificationPanels({ searchParams, navigate } = {}) {
  const notificationsOpen = useNotificationsStore((state) => state.open)

  const [friendListOpen, setFriendListOpen] = useState(false)

  const [friendRequestOpenSignal, setFriendRequestOpenSignal] = useState(0)

  const friendRequestTargetId = parseFriendRequestTargetId(searchParams)
  const gameInviteTargetId = parseInviteTargetId(searchParams)

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
