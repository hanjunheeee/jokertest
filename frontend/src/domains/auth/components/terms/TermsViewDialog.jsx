// 약관 전체 보기 창 (제목·버전·시행일·본문, 주소가 있으면 새 창 링크)
// 가입 약관 동의 칸·재동의 창이 씀 (데스크톱)
import CenterDialog from "@/shared/ui/dialog/CenterDialog.jsx"
import { termsLabelOf } from "@/domains/auth/utils/terms.js"
import {
  DIALOG_ACTIONS_CLASS, DIALOG_PRIMARY_BTN_CLASS, TERMS_BODY_CLASS, TERMS_META_CLASS,
} from "@/domains/auth/components/terms/termsStyle.js"

// 시행일 한국 날짜 글자 (예: 2026-11-09T00:00:00Z → 2026. 11. 9.)
const effectiveDateText = (iso) => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })
}

// terms가 없으면 안 그림
export default function TermsViewDialog({ terms, onClose }) {
  return (
    <CenterDialog open={Boolean(terms)} title={terms ? termsLabelOf(terms) : ""} onClose={onClose} labelledBy="terms-view-title">
      {terms ? (
        <>
          <p className={TERMS_META_CLASS}>
            버전 {terms.version} · 시행일 {effectiveDateText(terms.effectiveAt)}
          </p>
          <div className={TERMS_BODY_CLASS} tabIndex={0}>
            {terms.body || "본문이 없습니다. 아래 주소에서 확인해주세요."}
          </div>
          {terms.url ? (
            <a href={terms.url} target="_blank" rel="noopener noreferrer" className={TERMS_META_CLASS}>
              전문 새 창으로 보기
            </a>
          ) : null}
          <div className={DIALOG_ACTIONS_CLASS}>
            <button type="button" className={DIALOG_PRIMARY_BTN_CLASS} onClick={onClose}>닫기</button>
          </div>
        </>
      ) : null}
    </CenterDialog>
  )
}
