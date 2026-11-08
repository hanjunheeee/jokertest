// 약관 재동의 창 (새 필수 약관 목록·보기·동의, 동의 전엔 닫히지 않음)
// 데스크톱 App이 라우터 옆에 띄움, 상태는 useTermsReconsent
import { useState } from "react"
import CenterDialog from "@/shared/ui/dialog/CenterDialog.jsx"
import TermsViewDialog from "@/domains/auth/components/terms/TermsViewDialog.jsx"
import { useTermsReconsent } from "@/domains/auth/hooks/terms/useTermsReconsent.js"
import { termsLabelOf } from "@/domains/auth/utils/terms.js"
import {
  AGREEMENT_ROW_CLASS, AGREEMENT_VIEW_BTN_CLASS, DIALOG_ACTIONS_CLASS, DIALOG_ERROR_CLASS,
  DIALOG_PRIMARY_BTN_CLASS, DIALOG_TEXT_CLASS,
} from "@/domains/auth/components/terms/termsStyle.js"

export default function TermsReconsentGate() {
  const { pending, required, agree, submitting, error } = useTermsReconsent()
  const [viewingId, setViewingId] = useState(null)
  const viewing = pending.find((item) => item.id === viewingId) ?? null

  return (
    <>
      <CenterDialog open={required && !viewing} title="약관이 바뀌었습니다" closable={false} labelledBy="terms-reconsent-title">
        <p className={DIALOG_TEXT_CLASS}>계속 이용하려면 바뀐 약관을 확인하고 동의해주세요.</p>
        <ul className="flex flex-col gap-1">
          {pending.map((item) => (
            <li key={item.id} className={AGREEMENT_ROW_CLASS}>
              <span className={DIALOG_TEXT_CLASS}>{termsLabelOf(item)} (버전 {item.version})</span>
              <button type="button" className={AGREEMENT_VIEW_BTN_CLASS} onClick={() => setViewingId(item.id)}>보기</button>
            </li>
          ))}
        </ul>
        {error ? <p role="alert" className={DIALOG_ERROR_CLASS}>{error}</p> : null}
        <div className={DIALOG_ACTIONS_CLASS}>
          <button type="button" className={DIALOG_PRIMARY_BTN_CLASS} onClick={agree} disabled={submitting}>
            {submitting ? "저장 중..." : "모두 동의하고 계속"}
          </button>
        </div>
      </CenterDialog>
      <TermsViewDialog terms={viewing} onClose={() => setViewingId(null)} />
    </>
  )
}
