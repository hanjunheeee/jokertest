// 가입 약관 동의 칸 (전체 동의 · 약관마다 동의+보기 · 만 14세 이상 확인)
// 모바일 일반 가입·소셜 가입 칸이 씀, 상태는 데스크톱 useSignupTerms 결과(signupTerms)
import { LOGIN_ASSETS } from "@/shared/constants/loginAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"
import { termsLabelOf } from "@/domains/auth/utils/terms.js"
import TermsView from "@m/domains/auth/components/terms/TermsView.jsx"
import { TEXT_BTN_CLASS } from "@m/shared/ui/modal/textDialogStyle.js"

const BOX_CLASS = "flex flex-col gap-0.5 rounded border border-[#8b6a3e]/40 bg-black/5 px-2 py-1"
const ROW_CLASS = "flex items-center justify-between gap-2"
const LABEL_CLASS = "font-subheading font-bold text-text-body app-text-scaled [--app-text-size:13px]"
const STATUS_CLASS = "px-2 py-2 font-subheading text-text-body/80 app-text-scaled [--app-text-size:13px]"

// 체크 줄 하나 (그림 상자 + 글자), 누르는 자리 44px
function CheckRow({ checked, onChange, children }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left"
    >
      <span className="relative flex h-[1.125rem] w-[1.125rem] shrink-0 items-center justify-center">
        <PublicAsset src={LOGIN_ASSETS.checkbox} alt="" className="pointer-events-none h-[1.125rem] w-[1.125rem] select-none" />
        {checked ? (
          <svg className="pointer-events-none absolute h-3 w-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 13l4 4L19 7" />
          </svg>
        ) : null}
      </span>
      <span className={LABEL_CLASS}>{children}</span>
    </button>
  )
}

export default function TermsAgreement({ signupTerms }) {
  if (!signupTerms) return null
  const { terms, status, agreedIds, ageConfirmed, setAgeConfirmed, toggle, toggleAll, allChecked, viewing, openTerms, closeTerms, retry } = signupTerms

  if (status === "loading" || status === "idle") return <p className={STATUS_CLASS}>약관을 불러오는 중입니다.</p>
  if (status === "error") {
    return (
      <div className={ROW_CLASS}>
        <span className={STATUS_CLASS}>약관을 불러오지 못했습니다.</span>
        <button type="button" className={TEXT_BTN_CLASS} onClick={retry}>다시 불러오기</button>
      </div>
    )
  }

  return (
    <div className={BOX_CLASS} role="group" aria-label="약관 동의">
      <div className={`${ROW_CLASS} border-b border-[#8b6a3e]/30`}>
        <CheckRow checked={allChecked} onChange={toggleAll}>전체 동의</CheckRow>
      </div>
      {terms.map((item) => (
        <div key={item.id} className={ROW_CLASS}>
          <CheckRow checked={agreedIds.includes(item.id)} onChange={() => toggle(item.id)}>
            {item.required ? <span className="text-[#9C3D32]">(필수) </span> : "(선택) "}{termsLabelOf(item)} 동의
          </CheckRow>
          <button type="button" className={TEXT_BTN_CLASS} onClick={() => openTerms(item.id)}>보기</button>
        </div>
      ))}
      <div className={ROW_CLASS}>
        <CheckRow checked={ageConfirmed} onChange={setAgeConfirmed}>
          <span className="text-[#9C3D32]">(필수) </span>만 14세 이상입니다
        </CheckRow>
      </div>
      <TermsView terms={viewing} onClose={closeTerms} />
    </div>
  )
}
