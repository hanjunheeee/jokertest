// 대기방에서 나갈 때 안내 문구 (서버·연결 상태에 따라)
import { ROOM_MESSAGES } from "../constants/roomMessages.js"

const FORCE_LOBBY_REASONS = new Set([
    "room_check_empty",
    "room_deleted_event",
    "socket_stale",
    "self_left_room",
])

// 이유별 안내 (없으면 기본 문구)
export function matchingRoomExitMessage(meta) {
    const reason = meta?.reason ?? null
    if (reason === "room_deleted_event") return ROOM_MESSAGES.ROOM_DISBANDED
    if (reason === "socket_stale") return ROOM_MESSAGES.SESSION_LOST
    if (reason === "self_left_room") return ROOM_MESSAGES.SESSION_LOST
    if (reason === "room_check_empty") return ROOM_MESSAGES.ROOM_GONE
    if (FORCE_LOBBY_REASONS.has(reason)) return ROOM_MESSAGES.ROOM_GONE
    return ROOM_MESSAGES.ROOM_GONE
}

// 방 만들기 직후 로컬 신뢰 시간이어도 강제로 로비로 보낼 이유
export function shouldForceMatchingLobbyExit(meta) {
    return FORCE_LOBBY_REASONS.has(meta?.reason ?? null)
}