// 스킨·카드 미리보기 (서 있는 그림 또는 플레이어 카드, 바꾸기 버튼)
// SkinCardWearPanel이 씀
import { AnimatePresence, motion } from "framer-motion"
import InGamePlayerCard from "../../../game/ingame/components/board/InGamePlayerCard.jsx"
import { useUserProfileStore } from "../../store/user.store.js"
import PublicAsset from "../../../../shared/ui/PublicAsset.jsx"
import {
  PREVIEW_BODY_CLASS,
  PREVIEW_CARD_STAGE_CLASS,
  SKIN_CARD_WEAR_PREVIEW_CARD_WRAP_CLASS,
  PREVIEW_COLUMN_CLASS,
  SKIN_CARD_WEAR_PREVIEW_MODE_CARD,
  PREVIEW_MOTION,
  PREVIEW_MOTION_TRANSITION,
  PREVIEW_NAMEPLATE_THEME,
  PREVIEW_STAGE_CLASS,
  PREVIEW_STANDING_CLASS,
  PREVIEW_STANDING_WRAP_CLASS,
} from "../../constants/skinCardWear/skinCardWearLayout.js"
import SkinCardWearViewToggle from "./SkinCardWearViewToggle.jsx"

// 그림이 바뀔 때만 움직임이 다시 돌게 미리보기 키를 만듦
function resolvePreviewKey(preview, isCardPreview) {
  if (isCardPreview) {
    return `card:${preview.portraitSrc ?? ""}:${preview.frameSrc ?? ""}`
  }

  return `skin:${preview.standingSrc ?? "empty"}`
}

// 카드 미리보기는 인게임 카드를 내 닉네임으로 그대로 보임
export default function SkinCardWearPreview({ preview, previewMode, onTogglePreviewMode }) {
  const isCardPreview = preview.mode === SKIN_CARD_WEAR_PREVIEW_MODE_CARD
  const playerNickname = useUserProfileStore((state) => state.data?.nickname) ?? ""
  const previewKey = resolvePreviewKey(preview, isCardPreview)

  return (
    <section className={PREVIEW_COLUMN_CLASS} aria-label="스킨&카드 미리보기">
      <div className={PREVIEW_BODY_CLASS}>
        <AnimatePresence mode="wait">
          {isCardPreview ? (
            <motion.div
              key={previewKey}
              className={PREVIEW_CARD_STAGE_CLASS}
              initial={PREVIEW_MOTION.initial}
              animate={PREVIEW_MOTION.animate}
              exit={PREVIEW_MOTION.exit}
              transition={PREVIEW_MOTION_TRANSITION}
            >
              <div className={SKIN_CARD_WEAR_PREVIEW_CARD_WRAP_CLASS}>
                <InGamePlayerCard
                  portraitSrc={preview.portraitSrc}
                  frameSrc={preview.frameSrc}
                  nickname={playerNickname}
                  theme={PREVIEW_NAMEPLATE_THEME}
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={previewKey}
              className={PREVIEW_STAGE_CLASS}
              initial={PREVIEW_MOTION.initial}
              animate={PREVIEW_MOTION.animate}
              exit={PREVIEW_MOTION.exit}
              transition={PREVIEW_MOTION_TRANSITION}
            >
              {preview.standingSrc ? (
                <div className={PREVIEW_STANDING_WRAP_CLASS}>
                  <PublicAsset
                    src={preview.standingSrc}
                    alt=""
                    className={PREVIEW_STANDING_CLASS}
                  />
                </div>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <SkinCardWearViewToggle previewMode={previewMode} onToggle={onTogglePreviewMode} />
    </section>
  )
}
