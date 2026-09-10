// 파일 역할: StorePage.jsx - 라우터에서 렌더링되는 페이지입니다.
import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import SettingIntroSkipLayer from "@/domains/settings/components/SettingIntroSkipLayer.jsx"
import { useVideoIntro } from "@/shared/hooks/useVideoIntro.js"
import StoreEntryBackground from "../components/StoreEntryBackground.jsx"
import StorePanel from "../components/panel/StorePanel.jsx"
import StoreCurrencyBalance from "../components/StoreCurrencyBalance.jsx"
import { STORE_ASSETS } from "../constants/storeAssets.js"
import MotionBackButton from "@/shared/ui/MotionBackButton.jsx"
import { BACK_BUTTON_PAGE_POSITION_CLASS } from "@/shared/constants/navigationLayout.js"
import { publicAsset } from "@/shared/utils/publicAsset.js"
import { BG_FADE_TRANSITION, UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"
import { useEconomyStore } from "@/domains/economy/store/economy.store.js"

/** 로비에서 진입하는 상점 화면 — 진입 영상 1회 재생 후 UI 표시.
 *
 * F-09 R-IMPL(AC-06 재검토): 실제 브라우저 확인에서 서버는 구매·재로그인 후에도 실제
 * 잔액(예: 8500 GOLD/1000 DIAMOND)을 정확히 돌려줬지만, 화면에는 끝까지 더미 값
 * (12,450/320)만 보였다 — StoreCurrencyBalance가 인증된 서버 잔액을 아예 받지 못했기
 * 때문이다(그 컴포넌트의 기본값이 더미였다). StorePanel이 마운트 시 이미
 * useEconomyStore.fetchSummary()를 호출하므로(서버 재조회, F-08부터 존재), 여기서는 같은
 * 스토어를 구독해 그 결과(잔액·로딩/실패 상태)를 StoreCurrencyBalance에 그대로 전달한다 —
 * 중복 fetch를 만들지 않는다. */
export default function StorePage() {
  const navigate = useNavigate()
  const { bgVideoRef, introDone, skipIntro } = useVideoIntro()
  const balanceGold = useEconomyStore((state) => state.balanceGold)
  const balanceDiamond = useEconomyStore((state) => state.balanceDiamond)
  const economyStatus = useEconomyStore((state) => state.status)
  const retryEconomySummary = useEconomyStore((state) => state.retry)

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      {!introDone ? <StoreEntryBackground videoRef={bgVideoRef} /> : null}

      {introDone ? (
        <motion.img
          src={publicAsset(STORE_ASSETS.bg)}
          alt=""
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={BG_FADE_TRANSITION}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center"
          draggable={false}
        />
      ) : null}

      <SettingIntroSkipLayer visible={!introDone} onSkip={skipIntro} />
      <StoreCurrencyBalance
        visible={introDone}
        balanceGold={balanceGold}
        balanceDiamond={balanceDiamond}
        status={economyStatus}
        onRetry={retryEconomySummary}
      />
      <StorePanel visible={introDone} />

      <MotionBackButton
        initial={{ opacity: 0, y: 8 }}
        animate={introDone ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
        transition={UI_REVEAL_TRANSITION}
        onClick={() => navigate("/lobby")}
        className={`${BACK_BUTTON_PAGE_POSITION_CLASS} z-30`}
        style={{ pointerEvents: introDone ? "auto" : "none" }}
      />
    </div>
  )
}
