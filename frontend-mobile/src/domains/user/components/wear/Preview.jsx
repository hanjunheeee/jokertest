// 스킨·카드 미리보기 칸 (서 있는 그림 또는 플레이어 카드 + 스킨↔카드 바꾸기 버튼)
// WearSheet가 씀
import { AnimatePresence, motion } from "framer-motion"
import PreviewCard from "@m/domains/user/components/wear/PreviewCard.jsx"
import { SKIN_CARD_WEAR_ASSETS } from "@/domains/user/constants/skinCardWear/skinCardWearAssets.js"
import {
  PREVIEW_MOTION,
  PREVIEW_MOTION_TRANSITION,
  SKIN_CARD_WEAR_PREVIEW_MODE_CARD,
} from "@/domains/user/constants/skinCardWear/skinCardWearLayout.js"
import { useUserProfileStore } from "@/domains/user/store/user.store.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 그림이 바뀔 때만 움직임이 다시 돌게 키를 만듦 (데스크톱과 같음)
const previewKeyOf = (preview, isCard) =>
  isCard ? `card:${preview.portraitSrc ?? ""}:${preview.frameSrc ?? ""}` : `skin:${preview.standingSrc ?? "empty"}`

// 카드 미리보기는 내 닉네임으로, 바꾸기 버튼은 오른쪽 아래 겹침
export default function Preview({ preview, disabled, onToggle }) {
  const isCard = preview.mode === SKIN_CARD_WEAR_PREVIEW_MODE_CARD
  const nickname = useUserProfileStore((state) => state.data?.nickname) ?? ""

  return (
    <section
      aria-label="스킨&카드 미리보기"
      className="relative mx-4 mt-2 flex min-h-0 shrink-0 basis-[38%] items-end justify-center overflow-hidden rounded-md border border-[#c9a227]/25 bg-[radial-gradient(ellipse_at_50%_70%,#3a2416_0%,#140c08_75%)] land:mx-0 land:basis-auto land:flex-1"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={previewKeyOf(preview, isCard)}
          initial={PREVIEW_MOTION.initial}
          animate={PREVIEW_MOTION.animate}
          exit={PREVIEW_MOTION.exit}
          transition={PREVIEW_MOTION_TRANSITION}
          className="flex h-full w-full items-end justify-center"
        >
          {isCard ? (
            <div className="m-auto aspect-[338/369] h-[86%] max-w-[80%]">
              <PreviewCard portraitSrc={preview.portraitSrc} frameSrc={preview.frameSrc} nickname={nickname} />
            </div>
          ) : preview.standingSrc ? (
            <PublicAsset
              src={preview.standingSrc}
              alt=""
              className="block h-[96%] w-auto max-w-none select-none object-contain object-bottom [filter:drop-shadow(0_0_8px_rgba(0,0,0,0.78))_drop-shadow(0_10px_18px_rgba(0,0,0,0.52))]"
            />
          ) : null}
        </motion.div>
      </AnimatePresence>

      <button
        type="button"
        aria-label={isCard ? "스킨 일러스트 미리보기로 전환" : "플레이어 카드 미리보기로 전환"}
        aria-pressed={isCard}
        disabled={disabled}
        onClick={onToggle}
        className="absolute bottom-1 right-1 z-20 h-12 w-28 border-0 bg-transparent p-0 leading-none active:scale-95"
      >
        <PublicAsset src={SKIN_CARD_WEAR_ASSETS.previewToggleButton} alt="" className="block h-full w-full select-none object-contain" />
      </button>
    </section>
  )
}
