// 가입 약관 동의 칸 (전체 동의 · 약관마다 동의+보기 · 만 14세 이상 확인)
// 데스크톱 일반 가입·소셜 가입 칸이 씀, 상태는 useSignupTerms 결과(signupTerms)
import RememberMeCheckbox from "@/domains/auth/components/RememberMeCheckbox.jsx"
import TermsViewDialog from "@/domains/auth/components/terms/TermsViewDialog.jsx"
import { termsLabelOf } from "@/domains/auth/utils/terms.js"
import {
  AGREEMENT_ALL_ROW_CLASS, AGREEMENT_BOX_CLASS, AGREEMENT_REQUIRED_CLASS, AGREEMENT_ROW_CLASS,
  AGREEMENT_STATUS_CLASS, AGREEMENT_VIEW_BTN_CLASS,
} from "@/domains/auth/components/terms/termsStyle.js"

// 동의 줄 하나 (체크 상자 + 글자, 오른쪽 보기 버튼)
function AgreementRow({ checked, onChange, label, required, onView, className = AGREEMENT_ROW_CLASS }) {
  return (
    <div className={className}>
      <RememberMeCheckbox
        checked={checked}
        onChange={onChange}
        label={<>{required === true ? <span className={AGREEMENT_REQUIRED_CLASS}>(필수) </span> : null}{required === false ? "(선택) " : null}{label}</>}
      />
      {onView ? (
        <button type="button" className={AGREEMENT_VIEW_BTN_CLASS} onClick={onView}>보기</button>
      ) : null}
    </div>
  )
}

export default function SignupTermsAgreement({ signupTerms }) {
  if (!signupTerms) return null
  const { terms, status, agreedIds, ageConfirmed, setAgeConfirmed, toggle, toggleAll, allChecked, viewing, openTerms, closeTerms, retry } = signupTerms

  if (status === "loading" || status === "idle") {
    return <p className={`${AGREEMENT_BOX_CLASS} ${AGREEMENT_STATUS_CLASS}`}>약관을 불러오는 중입니다.</p>
  }
  if (status === "error") {
    return (
      <div className={`${AGREEMENT_BOX_CLASS} ${AGREEMENT_ROW_CLASS}`}>
        <span className={AGREEMENT_STATUS_CLASS}>약관을 불러오지 못했습니다.</span>
        <button type="button" className={AGREEMENT_VIEW_BTN_CLASS} onClick={retry}>다시 불러오기</button>
      </div>
    )
  }

  return (
    <div className={AGREEMENT_BOX_CLASS} role="group" aria-label="약관 동의">
      <AgreementRow className={AGREEMENT_ALL_ROW_CLASS} checked={allChecked} onChange={toggleAll} label="전체 동의" required={null} />
      {terms.map((item) => (
        <AgreementRow
          key={item.id}
          checked={agreedIds.includes(item.id)}
          onChange={() => toggle(item.id)}
          label={`${termsLabelOf(item)} 동의`}
          required={item.required}
          onView={() => openTerms(item.id)}
        />
      ))}
      <AgreementRow checked={ageConfirmed} onChange={setAgeConfirmed} label="만 14세 이상입니다" required />
      <TermsViewDialog terms={viewing} onClose={closeTerms} />
    </div>
  )
}
