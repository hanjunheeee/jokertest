// 약관 전체 보기 창 (제목·버전·시행일·본문, 주소가 있으면 새 창 링크)
// 모바일 가입 약관 칸·재동의 창이 씀, 데스크톱 TermsViewDialog의 모바일판
import TextDialog from "@m/shared/ui/modal/TextDialog.jsx"
import { termsLabelOf } from "@/domains/auth/utils/terms.js"
import {
  DIALOG_ACTIONS_CLASS, DIALOG_BODY_SCROLL_CLASS, DIALOG_META_CLASS, DIALOG_PRIMARY_BTN_CLASS, TEXT_BTN_CLASS,
} from "@m/shared/ui/modal/textDialogStyle.js"

const effectiveDateText = (iso) => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })
}

export default function TermsView({ terms, onClose }) {
  return (
    <TextDialog open={Boolean(terms)} title={terms ? termsLabelOf(terms) : ""} onClose={onClose}>
      {terms ? (
        <>
          <p className={DIALOG_META_CLASS}>버전 {terms.version} · 시행일 {effectiveDateText(terms.effectiveAt)}</p>
          <div className={DIALOG_BODY_SCROLL_CLASS} tabIndex={0}>
            {terms.body || "본문이 없습니다. 아래 주소에서 확인해주세요."}
          </div>
          {terms.url ? (
            <a href={terms.url} target="_blank" rel="noopener noreferrer" className={TEXT_BTN_CLASS}>전문 새 창으로 보기</a>
          ) : null}
          <div className={DIALOG_ACTIONS_CLASS}>
            <button type="button" className={DIALOG_PRIMARY_BTN_CLASS} onClick={onClose}>닫기</button>
          </div>
        </>
      ) : null}
    </TextDialog>
  )
}
