// 이모티콘 팔레트 화면 (/mypage/emoticons): 위 줄·안내 줄·팔레트 바퀴·보유 이모티콘·저장/취소·저장 완료 창
// app/routes/index.jsx가 씀, 상태와 동작은 데스크톱 useEmoticonPalettePage 그대로
import { useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import ActionBar from "@m/domains/user/components/emoticon/ActionBar.jsx"
import Grid from "@m/domains/user/components/emoticon/Grid.jsx"
import SaveDoneDialog from "@m/domains/user/components/emoticon/SaveDoneDialog.jsx"
import Status from "@m/domains/user/components/emoticon/Status.jsx"
import Toolbar from "@m/domains/user/components/emoticon/Toolbar.jsx"
import Wheel from "@m/domains/user/components/emoticon/Wheel.jsx"
import SoundMenu from "@m/shared/ui/sound/SoundMenu.jsx"
import TopBar from "@m/shared/ui/top/TopBar.jsx"
import { MY_PAGE_ASSETS } from "@/domains/user/constants/myPageAssets.js"
import { UI_FADE } from "@/domains/user/constants/emoticonPaletteLayoutStyle.js"
import { useEmoticonPalettePage } from "@/domains/user/hooks/useEmoticonPalettePage.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 위 줄: 데스크톱 화면 위층(뒤로 + 소리 조절)과 같은 두 가지, 제목 없음
const BAR_CLASS = "relative z-10 flex h-14 shrink-0 items-center gap-2 px-3 land:h-12"

// 세로: 바퀴 위·목록 아래(목록만 스크롤), 폰 가로·태블릿 가로: 바퀴 왼쪽·목록 오른쪽
export default function EmoticonPalettePage() {
  const navigate = useNavigate()
  const page = useEmoticonPalettePage()
  const { setSaveSuccessOpen } = page
  const closeSaveDone = useCallback(() => setSaveSuccessOpen(false), [setSaveSuccessOpen])

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <PublicAsset
        src={MY_PAGE_ASSETS.bg}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover object-bottom"
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-black/35" />

      <TopBar onBack={() => navigate("/mypage")} className={BAR_CLASS} right={<SoundMenu look="user" />} />

      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={UI_FADE}
        className="relative z-10 flex min-h-0 flex-1 flex-col"
      >
        <Status status={page.status} conflict={page.conflict} notice={page.notice} onRetry={page.load} />

        <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-3 land:flex-row land:gap-4 lg:flex-row lg:gap-6 lg:px-8">
          <section aria-label="이모티콘 팔레트" className="flex shrink-0 items-center justify-center land:w-[45%] lg:w-[45%]">
            <Wheel
              slots={page.selectedSlots}
              selectedSlotIndex={page.selectedSlotIndex}
              disabled={!page.isReady}
              onSelectSlot={page.selectSlot}
            />
          </section>

          <section aria-label="보유 이모티콘" className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
            <Toolbar page={page} />
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
              <Grid
                items={page.visibleItems}
                ownedIds={page.ownedIdSet}
                disabled={!page.isReady}
                onAssign={page.assignItem}
              />
            </div>
          </section>
        </div>
      </motion.main>

      <ActionBar page={page} />
      <SaveDoneDialog open={page.saveSuccessOpen} onDismiss={closeSaveDone} />
    </div>
  )
}
