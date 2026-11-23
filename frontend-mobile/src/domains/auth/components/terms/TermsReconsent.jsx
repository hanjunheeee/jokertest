// 약관 재동의 창 (새 필수 약관 목록·보기·동의, 동의 전엔 닫히지 않음)
// 모바일 App이 라우터 옆에 띄움, 상태는 데스크톱 useTermsReconsent
import { useState } from "react"
import ParchmentTextDialog from "@m/shared/ui/modal/parchment/ParchmentTextDialog.jsx"
import ConfirmButton from "@m/shared/ui/modal/parchment/ConfirmButton.jsx"
import TermsView from "@m/domains/auth/components/terms/TermsView.jsx"
import { useTermsReconsent } from "@/domains/auth/hooks/terms/useTermsReconsent.js"
import { termsLabelOf } from "@/domains/auth/utils/terms.js"
import {
  TERMS_RECONSENT_ACTIONS_CLASS,
  TERMS_RECONSENT_BODY_CLASS,
  TERMS_RECONSENT_BTN_CLASS,
  TERMS_RECONSENT_GUIDE_CLASS,
  TERMS_RECONSENT_ITEM_LABEL_CLASS,
  TERMS_RECONSENT_LIST_CLASS,
  TERMS_RECONSENT_ROW_CLASS,
} from "@/domains/auth/components/terms/termsStyle.js"
import { DIALOG_ERROR_CLASS, TEXT_BTN_CLASS } from "@m/shared/ui/modal/textDialogStyle.js"

export default function TermsReconsent() {
  const { pending, required, agree, submitting, error } = useTermsReconsent()
  const [viewingId, setViewingId] = useState(null)
  const viewing = pending.find((item) => item.id === viewingId) ?? null
  const confirmLabel = submitting ? "저장 중..." : "모두 동의하고 계속"

  return (
    <>
      <ParchmentTextDialog open={required && !viewing} title="약관이 바뀌었습니다" closable={false}>
        <div className={`${TERMS_RECONSENT_BODY_CLASS} w-full text-left`}>
          <p className={TERMS_RECONSENT_GUIDE_CLASS}>계속 이용하려면 바뀐 약관을 확인하고 동의해주세요.</p>
          <ul className={TERMS_RECONSENT_LIST_CLASS}>
            {pending.map((item) => (
              <li key={item.id} className={TERMS_RECONSENT_ROW_CLASS}>
                <span className={TERMS_RECONSENT_ITEM_LABEL_CLASS}>
                  {termsLabelOf(item)} (버전 {item.version})
                </span>
                <button
                  type="button"
                  className={TEXT_BTN_CLASS}
                  disabled={submitting}
                  onClick={() => setViewingId(item.id)}
                >
                  보기
                </button>
              </li>
            ))}
          </ul>
          {error ? (
            <p role="alert" className={`${DIALOG_ERROR_CLASS} text-center text-[#7a2010]`}>
              {error}
            </p>
          ) : null}
          <div className={TERMS_RECONSENT_ACTIONS_CLASS}>
            <ConfirmButton
              label={confirmLabel}
              onClick={agree}
              disabled={submitting}
              buttonClassName={TERMS_RECONSENT_BTN_CLASS}
              raised
            />
          </div>
        </div>
      </ParchmentTextDialog>
      <TermsView terms={viewing} onClose={() => setViewingId(null)} />
    </>
  )
}