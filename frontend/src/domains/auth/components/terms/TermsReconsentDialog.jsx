// 로비 약관 재동의 양피지 창 (필수 약관 목록·보기·모두 동의)
// TermsReconsentGate가 씀
import ParchmentTextDialog from "@/shared/ui/dialog/ParchmentTextDialog.jsx"
import InGameParchmentConfirmButton from "@/domains/game/ingame/components/parchment/InGameParchmentConfirmButton.js"
import { CONFIRM_BTN_CLASS_TIGHT } from "@/domains/game/ingame/constants/parchment/ingameParchmentConfirmButton.js"
import { termsLabelOf } from "@/domains/auth/utils/terms.js"
import {
  DIALOG_ERROR_CLASS,
  TERMS_PARCHMENT_FALLBACK_CONTENT_CLASS,
  TERMS_PARCHMENT_FALLBACK_FRAME_CLASS,
  TERMS_PARCHMENT_FORM_BODY_CLASS,
  TERMS_PARCHMENT_TITLE_OFFSET_CLASS,
  TERMS_RECONSENT_ACTIONS_CLASS,
  TERMS_RECONSENT_BODY_CLASS,
  TERMS_RECONSENT_BTN_CLASS,
  TERMS_RECONSENT_GUIDE_CLASS,
  TERMS_RECONSENT_ITEM_LABEL_CLASS,
  TERMS_RECONSENT_LIST_CLASS,
  TERMS_RECONSENT_PARCHMENT_CONTENT_CLASS,
  TERMS_RECONSENT_PARCHMENT_FRAME_CLASS,
  TERMS_RECONSENT_ROW_CLASS,
  TERMS_RECONSENT_VIEW_BTN_CLASS,
} from "@/domains/auth/components/terms/termsStyle.js"

const RECONSENT_CONFIRM_BTN_CLASS = `${CONFIRM_BTN_CLASS_TIGHT} !mt-0 ${TERMS_RECONSENT_BTN_CLASS}`

export default function TermsReconsentDialog({ open, pending, error, submitting, onAgree, onView }) {
  const confirmLabel = submitting ? "저장 중..." : "모두 동의하고 계속"

  return (
    <ParchmentTextDialog
      open={open}
      title="약관이 바뀌었습니다"
      closable={false}
      titleClassName={TERMS_PARCHMENT_TITLE_OFFSET_CLASS}
      frameClassName={TERMS_RECONSENT_PARCHMENT_FRAME_CLASS}
      fallbackFrameClassName={TERMS_PARCHMENT_FALLBACK_FRAME_CLASS}
      contentBaseClassName={TERMS_RECONSENT_PARCHMENT_CONTENT_CLASS}
      fallbackContentBaseClassName={TERMS_PARCHMENT_FALLBACK_CONTENT_CLASS}
    >
      <div className={TERMS_PARCHMENT_FORM_BODY_CLASS}>
        <div className={TERMS_RECONSENT_BODY_CLASS}>
          <p className={TERMS_RECONSENT_GUIDE_CLASS}>계속 이용하려면 바뀐 약관을 확인하고 동의해주세요.</p>
          <ul className={TERMS_RECONSENT_LIST_CLASS}>
            {pending.map((item) => (
              <li key={item.id} className={TERMS_RECONSENT_ROW_CLASS}>
                <span className={TERMS_RECONSENT_ITEM_LABEL_CLASS}>
                  {termsLabelOf(item)} (버전 {item.version})
                </span>
                <button
                  type="button"
                  className={TERMS_RECONSENT_VIEW_BTN_CLASS}
                  disabled={submitting}
                  onClick={() => onView(item.id)}
                >
                  보기
                </button>
              </li>
            ))}
          </ul>
          {error ? (
            <p role="alert" className={`${DIALOG_ERROR_CLASS} text-center`}>
              {error}
            </p>
          ) : null}
          <div className={TERMS_RECONSENT_ACTIONS_CLASS}>
            <InGameParchmentConfirmButton
              label={confirmLabel}
              onClick={onAgree}
              disabled={submitting}
              className={RECONSENT_CONFIRM_BTN_CLASS}
            />
          </div>
        </div>
      </div>
    </ParchmentTextDialog>
  )
}