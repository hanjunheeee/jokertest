// 사망 후 선택 창 훅: 관전 계속 고른 범위·나가기 실패 확인을 기억하고 창 열림 정함
// useOverlayLayer가 씀, 조건은 데스크톱 InGamePage와 같음 (나가기 손잡이는 overlayBridge에서 받음)
import { useState, useSyncExternalStore } from "react"
import {
    getIdentityScopeVersion,
    subscribeIdentityScope,
    useInGameStore,
} from "@/domains/game/ingame/store/ingameStore.js"
import { useAuthStore } from "@/domains/auth/store/auth.store.js"
import { selectInGameDeadParticipantChoice } from "@/domains/game/ingame/utils/selectInGameDeadParticipantChoice.js"
import { useOverlayBridge } from "./overlayBridge.js"

// 나가기 손잡이를 아직 못 받았을 때 값 (나가기 버튼만 막힘)
const NO_EXIT = Object.freeze({
    requestExit: null,
    retryExit: null,
    resolveExitOutcome: null,
    exitStatus: "idle",
    exitErrorCode: null,
    exitAttemptId: 0,
})

// blocked = 앞 연출(역할·밤 성공·밤 결과·대기)이 열려 있음
export function useDeadChoice({ blocked = false } = {}) {
    const gameId = useInGameStore((s) => s.gameId)
    const gameState = useInGameStore((s) => s.state)
    const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
    const identityGeneration = useAuthStore((s) => s.identityGeneration ?? null)
    const identityScopeVersion = useSyncExternalStore(
        subscribeIdentityScope, getIdentityScopeVersion, getIdentityScopeVersion,
    )
    const exit = useOverlayBridge((s) => s.exit) ?? NO_EXIT

    // 계정·신원·판이 바뀌면 관전 선택을 다시 물음
    const choiceScopeKey = `${authUuid}|${identityGeneration}|${gameId}|${identityScopeVersion}`
    const [keepWatchingScope, setKeepWatchingScope] = useState(null)
    const keepWatchingChosen = keepWatchingScope !== null && keepWatchingScope === choiceScopeKey
    const needsDeadChoice = selectInGameDeadParticipantChoice(gameState, authUuid) && !keepWatchingChosen

    // 나가기 시도마다 실패 안내를 한 번 보여 주고, 관전 계속 고르면 그 시도 안내는 닫음
    const exitRecoveryKey = `${choiceScopeKey}|${exit.exitAttemptId}`
    const [acknowledgedExitRecovery, setAcknowledgedExitRecovery] = useState(null)
    const needsExitRecovery = exit.exitStatus !== "idle" && acknowledgedExitRecovery !== exitRecoveryKey

    const keepWatching = () => {
        setKeepWatchingScope(choiceScopeKey)
        setAcknowledgedExitRecovery(exitRecoveryKey)
    }

    return {
        open: (needsDeadChoice || needsExitRecovery) && !blocked,
        keepWatching,
        leave: exit.requestExit,
        retry: exit.retryExit,
        resolveOutcome: exit.resolveExitOutcome,
        exitStatus: exit.exitStatus,
        exitErrorCode: exit.exitErrorCode,
    }
}
