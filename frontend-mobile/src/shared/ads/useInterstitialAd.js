// 결과 화면에서 한 판 끝 광고를 언제 열지: 첫 연출 끝나고 1.5초 뒤, 판마다 한 번
// pages/GameResultPage가 씀, 연 판 번호는 열 때 바로 기억 (닫기 전에 화면을 떠나도 다시 안 띄움)
import { useEffect, useState } from "react"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { slotMode } from "@m/shared/ads/adConfig.js"
import { AD_CONFIG, AD_IS_DEV } from "@m/shared/ads/currentAdConfig.js"
import { INTERSTITIAL_OPEN_DELAY_MS, pickGameKey, shouldOpenInterstitial } from "@m/shared/ads/interstitialRule.js"
import { loadSeenGames, rememberGame, saveSeenGames } from "@m/shared/ads/seenGames.js"

// localStorage는 막힌 브라우저에서 꺼내기만 해도 던짐
const safeStorage = () => {
    try {
        return window.localStorage
    } catch {
        return null
    }
}

// 저장소가 막혀도 이번 접속 동안은 기억
let memorySeen = []

const readSeen = () => [...loadSeenGames(safeStorage()), ...memorySeen]

const remember = (gameKey) => {
    memorySeen = rememberGame(memorySeen, gameKey)
    saveSeenGames(safeStorage(), rememberGame(loadSeenGames(safeStorage()), gameKey))
}

// stage: 결과 화면 단계, isPreview·outcome: 개발 미리보기(?outcome=)일 때 판 번호 대신 씀
export function useInterstitialAd({ stage, isPreview = false, outcome = null }) {
    const gameId = useInGameStore((s) => s.gameId ?? null)
    const mode = slotMode(AD_CONFIG, "interstitial", AD_IS_DEV)
    const gameKey = pickGameKey({ gameId, isPreview, outcome, isDev: AD_IS_DEV })
    const [openKey, setOpenKey] = useState(null)

    useEffect(() => {
        if (!shouldOpenInterstitial({ stage, mode, gameKey, seen: readSeen() })) return undefined
        const timer = window.setTimeout(() => {
            remember(gameKey)
            setOpenKey(gameKey)
        }, INTERSTITIAL_OPEN_DELAY_MS)
        return () => window.clearTimeout(timer)
    }, [stage, mode, gameKey])

    return {
        open: openKey !== null && openKey === gameKey,
        mode,
        close: () => setOpenKey(null),
    }
}
