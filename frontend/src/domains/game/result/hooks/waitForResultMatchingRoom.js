// 판 끝 직후 결과 화면에서 방이 생길 때까지 기다림 (현재 방·파티 우편함·방 준비 방송)
// useGameResultReturnToMatching이 씀
import { askPartyRoom, onParty } from "@/domains/game/matching/socket/party.js"
import { askRoom } from "@/domains/game/shared/socket/room.js"
import { consumeRoomReady, rememberRoomReady } from "@/domains/game/shared/utils/partyMatchingRejoin.js"
import { RESULT_RETURN_POLL_MS, RESULT_RETURN_WAIT_MS } from "../constants/resultReturnMatchingTiming.js"

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// endedGameId 있으면 그 판 우편함·방송만 받음
export async function waitForResultMatchingRoom(socket, { endedGameId, isCurrent }) {
  let readyRoom = null
  const noop = () => {}
  const off = onParty(socket, {
    joined: noop,
    joinFailed: noop,
    ready: (payload) => {
      if (typeof endedGameId === "string" && endedGameId.length > 0 && payload?.gameId !== endedGameId) return
      if (payload?.room) {
        rememberRoomReady(payload)
        readyRoom = payload.room
      }
    },
  })

  const readCachedRoom = () => {
    const cached = consumeRoomReady(endedGameId ?? undefined)
    if (cached?.room) return cached.room
    if (readyRoom) return readyRoom
    return null
  }

  const askPartyMailbox = async () => {
    if (typeof endedGameId !== "string" || endedGameId.length === 0) return null
    try {
      const party = await askPartyRoom(socket, { gameId: endedGameId })
      if (!isCurrent()) return null
      if (party?.ok && party.room) return party.room
    } catch {
      // 다른 Node·일시 거절이면 무시
    }
    return null
  }

  try {
    const cached = readCachedRoom()
    if (cached) return cached

    let current = null
    try {
      current = await askRoom(socket)
    } catch {
      current = null
    }
    if (!isCurrent()) return null
    if (current?.ok && current.room) return current.room

    const mailbox = await askPartyMailbox()
    if (mailbox) return mailbox

    const afterParty = readCachedRoom()
    if (afterParty) return afterParty

    // 방 없음 + 전환 처리 중(pending)일 때만 길게 기다림
    if (!(current?.ok && current.pending === true)) {
      return null
    }

    const deadline = Date.now() + RESULT_RETURN_WAIT_MS
    while (Date.now() < deadline && isCurrent()) {
      await wait(RESULT_RETURN_POLL_MS)

      const hit = readCachedRoom()
      if (hit) return hit

      try {
        current = await askRoom(socket)
      } catch {
        current = null
      }
      if (!isCurrent()) return null
      if (current?.ok && current.room) return current.room

      const partyRoom = await askPartyMailbox()
      if (partyRoom) return partyRoom

      if (!(current?.ok && current.pending === true)) break
    }
  } finally {
    off()
  }

  return readyRoom
}