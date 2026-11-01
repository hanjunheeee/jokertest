// 상점 화면 (/store): 입장 영상 뒤 위 줄(뒤로·재화·소리) + 상점 판, 일괄구매 확인·확대 보기는 창
// app/routes/index.jsx가 씀, 상태·구매 흐름은 데스크톱 useStorePanel·storePurchase 그대로
import { useNavigate } from "react-router-dom"
import { useVideoIntro } from "@/shared/hooks/useVideoIntro.js"
import { useEconomyStore } from "@/domains/economy/store/economy.store.js"
import { useStorePanel } from "@/domains/store/hooks/useStorePanel.js"
import StoreBackdrop from "../components/intro/StoreBackdrop.jsx"
import StoreTopBar from "../components/top/StoreTopBar.jsx"
import StorePanel from "../components/panel/StorePanel.jsx"
import StoreSheets from "../components/StoreSheets.jsx"

// 영상이 끝나거나 건너뛰면 화면을 보임, 영상 중엔 누르기 막음 (데스크톱과 같음)
export default function StorePage() {
    const navigate = useNavigate()
    const { bgVideoRef, introDone, skipIntro } = useVideoIntro()
    // 보유 재화는 경제 스토어에서 읽음 (불러오기 실패면 다시 받기)
    const balanceGold = useEconomyStore((state) => state.balanceGold)
    const balanceDiamond = useEconomyStore((state) => state.balanceDiamond)
    const economyStatus = useEconomyStore((state) => state.status)
    const retryEconomySummary = useEconomyStore((state) => state.retry)
    const panel = useStorePanel()

    return (
        <div className="relative flex h-full w-full flex-col overflow-hidden bg-black">
            <StoreBackdrop videoRef={bgVideoRef} introDone={introDone} onSkip={skipIntro} />

            <StoreTopBar
                visible={introDone}
                onBack={() => navigate("/lobby")}
                balanceGold={balanceGold}
                balanceDiamond={balanceDiamond}
                economyStatus={economyStatus}
                onRetryEconomy={retryEconomySummary}
            />
            <StorePanel visible={introDone} panel={panel} />

            <StoreSheets panel={panel} />
        </div>
    )
}
