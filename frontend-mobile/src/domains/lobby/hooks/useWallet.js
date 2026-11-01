// 로비 위 띠의 지갑 값 (처음 그릴 때 지갑 요약 한 번 받기 + 잔액·상태·다시 시도)
// 모바일 로비 TopBar가 씀
import { useEffect } from "react"
import { useEconomyStore } from "@/domains/economy/store/economy.store.js"

// 데스크톱 배너 초상이 하던 요약 받기를 여기서 한 번만 함 (장착 초상도 이 응답으로 들어옴)
export function useWallet() {
    const balanceGold = useEconomyStore((state) => state.balanceGold)
    const balanceDiamond = useEconomyStore((state) => state.balanceDiamond)
    const status = useEconomyStore((state) => state.status)
    const retry = useEconomyStore((state) => state.retry)

    useEffect(() => {
        useEconomyStore.getState().fetchSummary()
    }, [])

    return { balanceGold, balanceDiamond, status, retry }
}
