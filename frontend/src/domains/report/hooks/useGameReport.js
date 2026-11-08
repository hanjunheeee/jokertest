// 지금 판 신고 창: 인게임 스토어의 판 id·내 uuid로 useReportDialog를 엶
// 데스크톱 전적 목록·결과 참가자 목록, 모바일 전적 시트·결과 목록이 씀 (판 id 없으면 신고 버튼 안 보임)
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { useAuthStore } from "@/domains/auth/store/auth.store.js"
import { useReportDialog } from "./useReportDialog.js"

export function useGameReport() {
  const gameId = useInGameStore((s) => s.gameId ?? null)
  const selfUuid = useInGameStore((s) => s.state?.self?.uuid ?? null)
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  return useReportDialog({ gameId, selfUuid: selfUuid ?? authUuid })
}
