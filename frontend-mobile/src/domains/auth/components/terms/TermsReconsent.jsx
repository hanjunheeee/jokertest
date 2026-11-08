// 약관 재동의 창 (새 필수 약관 목록·보기·동의, 동의 전엔 닫히지 않음)
// 모바일 App이 라우터 옆에 띄움, 상태는 데스크톱 useTermsReconsent
import { useState } from "react"
import TextDialog from "@m/shared/ui/modal/TextDialog.jsx"
import TermsView from "@m/domains/auth/components/terms/TermsView.jsx"
import { useTermsReconsent } from "@/domains/auth/hooks/terms/useTermsReconsent.js"
import { termsLabelOf } from "@/domains/auth/utils/terms.js"
import {
  DIALOG_ACTIONS_CLASS, DIALOG_ERROR_CLASS, DIALOG_PRIMARY_BTN_CLASS, DIALOG_TEXT_CLASS, TEXT_BTN_CLASS,
} from "@m/shared/ui/modal/textDialogStyle.js"

export default function TermsReconsent() {
  const { pending, required, agree, submitting, error } = useTermsReconsent()
  const [viewingId, setViewingId] = useState(null)
  const viewing = pending.find((item) => item.id === viewingId) ?? null

  return (
    <>
      <TextDialog open={required && !viewing} title="약관이 바뀌었습니다" closable={false}>
        <p className={DIALOG_TEXT_CLASS}>계속 이용하려면 바뀐 약관을 확인하고 동의해주세요.</p>
        <ul className="flex flex-col">
          {pending.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-2">
              <span className={DIALOG_TEXT_CLASS}>{termsLabelOf(item)} (버전 {item.version})</span>
              <button type="button" className={TEXT_BTN_CLASS} onClick={() => setViewingId(item.id)}>보기</button>
            </li>
          ))}
        </ul>
        {error ? <p role="alert" className={DIALOG_ERROR_CLASS}>{error}</p> : null}
        <div className={DIALOG_ACTIONS_CLASS}>
          <button type="button" className={DIALOG_PRIMARY_BTN_CLASS} onClick={agree} disabled={submitting}>
            {submitting ? "저장 중..." : "모두 동의하고 계속"}
          </button>
        </div>
      </TextDialog>
      <TermsView terms={viewing} onClose={() => setViewingId(null)} />
    </>
  )
}
