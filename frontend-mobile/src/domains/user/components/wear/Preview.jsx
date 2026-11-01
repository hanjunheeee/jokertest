// 스킨·카드 미리보기 칸 (서 있는 그림 또는 플레이어 카드 + 스킨↔카드 바꾸기 버튼)
// WearSheet가 씀
import { AnimatePresence, motion } from "framer-motion"
import PreviewCard from "@m/domains/user/components/wear/PreviewCard.jsx"
import { SKIN_CARD_WEAR_ASSETS } from "@/domains/user/constants/skinCardWear/skinCardWearAssets.js"
import {
  PREVIEW_MOTION,
  PREVIEW_MOTION_TRANSITION,
  PREVIEW_STANDING_CLASS,
  SKIN_CARD_WEAR_PREVIEW_MODE_CARD,
  VIEW_TOGGLE_IMG_CLASS,
} from "@/domains/user/constants/skinCardWear/skinCardWearLayout.js"
import { useUserProfileStore } from "@/domains/user/store/user.store.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { publicAsset } from "@/shared/utils/publicAsset.js"

// 데스크톱 미리보기 뒤 배경은 팝업 틀 그림 오른쪽(방 그림)이라 그 부분만 잘라 깖
// 크기는 칸 비율 따라 (폰 세로: 높이 기준, 넓은 칸: 폭 기준) --bg-size로 고름
const BG_STYLE = {
  backgroundImage: `url("${publicAsset(SKIN_CARD_WEAR_ASSETS.popupFrame)}")`,
  backgroundSize: "var(--bg-size)",
  backgroundPosition: "97% 45%",
  backgroundRepeat: "no-repeat",
}

// 그림이 바뀔 때만 움직임이 다시 돌게 키를 만듦 (데스크톱과 같음)
const previewKeyOf = (preview, isCard) =>
  isCard ? `card:${preview.portraitSrc ?? ""}:${preview.frameSrc ?? ""}` : `skin:${preview.standingSrc ?? "empty"}`

// 카드 미리보기는 내 닉네임으로, 바꾸기 버튼은 오른쪽 아래 겹침
export default function Preview({ preview, onToggle }) {
  const isCard = preview.mode === SKIN_CARD_WEAR_PREVIEW_MODE_CARD
  const nickname = useUserProfileStore((state) => state.data?.nickname) ?? ""

  return (
    <section
      aria-label="스킨&카드 미리보기"
      style={BG_STYLE}
      className="relative mx-4 flex [--bg-size:auto_140%] md:[--bg-size:200%_auto] land:[--bg-size:200%_auto] min-h-0 shrink-0 basis-[38%] items-end justify-center overflow-hidden rounded-md border border-[#c9a227]/25 bg-[#140c08] land:mx-0 land:basis-auto land:flex-1"
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
            <div className="flex h-[90%] w-full items-end justify-center">
              <PublicAsset src={preview.standingSrc} alt="" className={PREVIEW_STANDING_CLASS} />
            </div>
          ) : null}
        </motion.div>
      </AnimatePresence>

      <button
        type="button"
        aria-label={isCard ? "스킨 일러스트 미리보기로 전환" : "플레이어 카드 미리보기로 전환"}
        aria-pressed={isCard}
        onClick={onToggle}
        className="group absolute bottom-1 right-1 z-20 h-12 w-28 cursor-pointer border-0 bg-transparent p-0 leading-none"
        style={{ outline: "none" }}
      >
        <PublicAsset src={SKIN_CARD_WEAR_ASSETS.previewToggleButton} alt="" className={VIEW_TOGGLE_IMG_CLASS} />
      </button>
    </section>
  )
}
