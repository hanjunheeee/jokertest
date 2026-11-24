// 약관 전체 보기 창 (제목·버전·시행일·본문, 주소가 있으면 새 창 링크)
// 가입 약관 동의 칸·재동의 창이 씀 (데스크톱, 양피지 모달)
import { useRef } from "react"
import { termsLabelOf } from "@/domains/auth/utils/terms.js"
import ParchmentTextDialog from "@/shared/ui/dialog/ParchmentTextDialog.jsx"
import InGameParchmentConfirmButton from "@/domains/game/ingame/components/parchment/InGameParchmentConfirmButton.js"
import { CONFIRM_BTN_CLASS_TIGHT } from "@/domains/game/ingame/constants/parchment/ingameParchmentConfirmButton.js"
import {
  TERMS_PARCHMENT_BODY_CLASS,
  TERMS_PARCHMENT_BODY_SCROLL_CLASS,
  TERMS_PARCHMENT_CLOSE_WRAP_CLASS,
  TERMS_PARCHMENT_BODY_BLOCK_OFFSET_CLASS,
  TERMS_PARCHMENT_CONTENT_COLUMN_CLASS,
  TERMS_PARCHMENT_EMPTY_CLASS,
  TERMS_PARCHMENT_TITLE_OFFSET_CLASS,
  TERMS_PARCHMENT_VIEW_TITLE_CLASS,
  TERMS_PARCHMENT_FALLBACK_FRAME_CLASS,
  TERMS_PARCHMENT_FORM_BODY_CLASS,
  TERMS_PARCHMENT_FRAME_CLASS,
  TERMS_PARCHMENT_PRIVACY_FALLBACK_FRAME_CLASS,
  TERMS_PARCHMENT_PRIVACY_FRAME_CLASS,
  TERMS_PARCHMENT_LINK_CLASS,
  TERMS_PARCHMENT_META_CLASS,
  TERMS_PARCHMENT_TEXT_INSET_CLASS,
} from "@/domains/auth/components/terms/termsStyle.js"

const CLOSE_BTN_CLASS = `${CONFIRM_BTN_CLASS_TIGHT} w-[clamp(6rem,12vw,7.5rem)] shrink-0`

const effectiveDateText = (iso) => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })
}

export default function TermsViewDialog({ terms, onClose }) {
  const closeButtonRef = useRef(null)
  const title = terms ? termsLabelOf(terms) : ""
  const isPrivacy = terms?.kind === "PRIVACY"

  return (
    <ParchmentTextDialog
      open={Boolean(terms)}
      title={title}
      titleClassName={`${TERMS_PARCHMENT_TITLE_OFFSET_CLASS} ${TERMS_PARCHMENT_VIEW_TITLE_CLASS}`}
      onClose={onClose}
      frameClassName={isPrivacy ? TERMS_PARCHMENT_PRIVACY_FRAME_CLASS : TERMS_PARCHMENT_FRAME_CLASS}
      fallbackFrameClassName={
        isPrivacy ? TERMS_PARCHMENT_PRIVACY_FALLBACK_FRAME_CLASS : TERMS_PARCHMENT_FALLBACK_FRAME_CLASS
      }
    >
      {terms ? (
        <div className={TERMS_PARCHMENT_FORM_BODY_CLASS}>
          <div
            className={`${TERMS_PARCHMENT_CONTENT_COLUMN_CLASS} ${TERMS_PARCHMENT_BODY_BLOCK_OFFSET_CLASS} min-h-0 flex-1 flex-col gap-[clamp(0.35rem,0.9vw,0.55rem)]`}
          >
            <p className={TERMS_PARCHMENT_META_CLASS}>
              버전 {terms.version} · 시행일 {effectiveDateText(terms.effectiveAt)}
            </p>
            <div tabIndex={0} className={TERMS_PARCHMENT_BODY_SCROLL_CLASS}>
              <div className={TERMS_PARCHMENT_BODY_CLASS}>
                {terms.body || (
                  <span className={TERMS_PARCHMENT_EMPTY_CLASS}>
                    본문이 없습니다. 아래 주소에서 확인해주세요.
                  </span>
                )}
              </div>
            </div>
            {terms.url ? (
              <a
                href={terms.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`${TERMS_PARCHMENT_LINK_CLASS} ${TERMS_PARCHMENT_TEXT_INSET_CLASS} shrink-0`}
              >
                전문 새 창으로 보기
              </a>
            ) : null}
          </div>
          <div className={TERMS_PARCHMENT_CLOSE_WRAP_CLASS}>
            <InGameParchmentConfirmButton
              label="닫기"
              onClick={onClose}
              buttonRef={closeButtonRef}
              className={CLOSE_BTN_CLASS}
              sfxKind="ui-cancel"
            />
          </div>
        </div>
      ) : null}
    </ParchmentTextDialog>
  )
}
