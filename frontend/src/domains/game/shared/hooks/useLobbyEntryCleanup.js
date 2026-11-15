// 로비 입장 정리 훅: 화면이 열릴 때 서버에 enter_lobby를 한 번 보내 남은 판·대기방 자리를 지우게 함
// 로비·방 목록·게임 모드·게임 설정 화면(PC·모바일)이 씀, 대기방·판·결과·코드 입력 화면은 안 씀 (거기 있는 사람을 지우면 안 돼서)
import { useEffect, useSyncExternalStore } from "react"
import { useNavigate } from "react-router-dom"
import { getSocket, subscribeSocket } from "@/shared/socket/socketClient.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore.js"
import { enterLobby } from "@/domains/game/shared/socket/room.js"

// 같은 판으로 되돌려 보내기는 이 시간 안에 한 번만 (판 화면이 판을 못 찾고 다시 방 목록으로 보낼 때 왔다 갔다 막기)
const REDIRECT_REPEAT_GUARD_MS = 10000
let lastRedirect = { gameId: null, at: 0 }

// 판 화면으로 보내도 되는지 (같은 판을 방금 보냈으면 안 보냄)
function canRedirectTo(gameId) {
  const now = Date.now()
  if (lastRedirect.gameId === gameId && now - lastRedirect.at < REDIRECT_REPEAT_GUARD_MS) return false
  lastRedirect = { gameId, at: now }
  return true
}

// 판 중 산 사람 답: 다른 판 정보가 남아 있으면 비우고 판 화면으로 (판 화면이 판 id 없이 스냅샷을 물어 내 판을 찾음)
function goBackToGame(navigate, gameId) {
  if (!canRedirectTo(gameId)) return
  const ingame = useInGameStore.getState()
  if (ingame.gameId && ingame.gameId !== gameId) ingame.clearGame()
  navigate("/ingame", { replace: true })
}

// 정리 끝 답: 이 탭에 남은 방 정보도 비움 (서버에선 방에서 빠졌음, 대기방에서 뒤로 가기로 온 경우)
function forgetRoom() {
  const matching = useMatchingStore.getState()
  if (matching.roomId || matching.isInRoom) matching.clearRoom()
}

// 화면이 열릴 때·소켓이 바뀔 때만 한 번 보냄 (같은 화면에서 다시 보내면 그사이 누른 입장 요청을 지워서, navigate는 데이터 라우터라 안 바뀜)
// 답이 오기 전에 화면을 떠나면 답은 버림
// 답: { ok, redirect:'INGAME'|null, gameId } (밀린 옛 창이면 ok:false → 아무것도 안 함)
export function useLobbyEntryCleanup() {
  const navigate = useNavigate()
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  useEffect(() => {
    if (!socket) return undefined
    let active = true
    enterLobby(socket, (reply) => {
      if (!active || reply?.ok !== true) return
      if (reply.redirect === "INGAME" && typeof reply.gameId === "string" && reply.gameId) {
        goBackToGame(navigate, reply.gameId)
        return
      }
      forgetRoom()
    })
    return () => {
      active = false
    }
  }, [socket, navigate])
}
