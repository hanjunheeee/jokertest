import { AnimatePresence, motion } from "framer-motion"
import InGamePlayerCard from "@/domains/game/ingame/components/board/InGamePlayerCard.jsx"
import { useUserProfileStore } from "@/domains/user/store/user.store.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import {
  SKIN_CARD_WEAR_PREVIEW_BODY_CLASS,
  SKIN_CARD_WEAR_PREVIEW_CARD_STAGE_CLASS,
  SKIN_CARD_WEAR_PREVIEW_CARD_WRAP_CLASS,
  SKIN_CARD_WEAR_PREVIEW_COLUMN_CLASS,
  SKIN_CARD_WEAR_PREVIEW_MODE_CARD,
  SKIN_CARD_WEAR_PREVIEW_MOTION,
  SKIN_CARD_WEAR_PREVIEW_MOTION_TRANSITION,
  SKIN_CARD_WEAR_PREVIEW_NAMEPLATE_THEME,
  SKIN_CARD_WEAR_PREVIEW_STAGE_CLASS,
  SKIN_CARD_WEAR_PREVIEW_STANDING_CLASS,
  SKIN_CARD_WEAR_PREVIEW_STANDING_WRAP_CLASS,
} from "@/domains/user/constants/skinCardWear/skinCardWearLayout.js"
import SkinCardWearViewToggle from "./SkinCardWearViewToggle.jsx"

function resolveSkinCardWearPreviewKey(preview, isCardPreview) {
  if (isCardPreview) {
    return `card:${preview.portraitSrc ?? ""}:${preview.frameSrc ?? ""}`
  }

  return `skin:${preview.standingSrc ?? "empty"}`
}

export default function SkinCardWearPreview({ preview, previewMode, onTogglePreviewMode }) {
  const isCardPreview = preview.mode === SKIN_CARD_WEAR_PREVIEW_MODE_CARD
  const playerNickname = useUserProfileStore((state) => state.data?.nickname) ?? ""
  const previewKey = resolveSkinCardWearPreviewKey(preview, isCardPreview)

  return (
    <section className={SKIN_CARD_WEAR_PREVIEW_COLUMN_CLASS} aria-label="스킨&카드 미리보기">
      <div className={SKIN_CARD_WEAR_PREVIEW_BODY_CLASS}>
        <AnimatePresence mode="wait">
          {isCardPreview ? (
            <motion.div
              key={previewKey}
              className={SKIN_CARD_WEAR_PREVIEW_CARD_STAGE_CLASS}
              initial={SKIN_CARD_WEAR_PREVIEW_MOTION.initial}
              animate={SKIN_CARD_WEAR_PREVIEW_MOTION.animate}
              exit={SKIN_CARD_WEAR_PREVIEW_MOTION.exit}
              transition={SKIN_CARD_WEAR_PREVIEW_MOTION_TRANSITION}
            >
              <div className={SKIN_CARD_WEAR_PREVIEW_CARD_WRAP_CLASS}>
                <InGamePlayerCard
                  portraitSrc={preview.portraitSrc}
                  frameSrc={preview.frameSrc}
                  nickname={playerNickname}
                  theme={SKIN_CARD_WEAR_PREVIEW_NAMEPLATE_THEME}
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={previewKey}
              className={SKIN_CARD_WEAR_PREVIEW_STAGE_CLASS}
              initial={SKIN_CARD_WEAR_PREVIEW_MOTION.initial}
              animate={SKIN_CARD_WEAR_PREVIEW_MOTION.animate}
              exit={SKIN_CARD_WEAR_PREVIEW_MOTION.exit}
              transition={SKIN_CARD_WEAR_PREVIEW_MOTION_TRANSITION}
            >
              {preview.standingSrc ? (
                <div className={SKIN_CARD_WEAR_PREVIEW_STANDING_WRAP_CLASS}>
                  <PublicAsset
                    src={preview.standingSrc}
                    alt=""
                    className={SKIN_CARD_WEAR_PREVIEW_STANDING_CLASS}
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
