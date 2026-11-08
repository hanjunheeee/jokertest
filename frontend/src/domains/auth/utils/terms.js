// 약관 동의 판정 도구 (필수 다 골랐나·보낼 값 만들기·종류 이름)
// 가입 약관 훅·재동의 훅·데스크톱·모바일 약관 칸이 씀, 서버도 같은 기준으로 다시 검사함

// 약관 종류 → 화면 이름
export const TERMS_KIND_LABELS = {
  TERMS: "이용약관",
  PRIVACY: "개인정보 처리방침",
}

// 종류 이름 (모르는 종류면 서버 제목)
export function termsLabelOf(terms) {
  return TERMS_KIND_LABELS[terms?.kind] ?? terms?.title ?? "약관"
}

// 필수 약관 전부 + 만 14세 확인까지 골랐는지 (약관 목록이 비면 아직 못 불러온 것으로 거짓)
// 예: 약관 [1 필수, 2 필수], 고른 [1, 2], 14세 체크 → 참
export function isAllRequiredAgreed(terms, agreedIds, ageConfirmed) {
  if (!Array.isArray(terms) || terms.length === 0) return false
  if (ageConfirmed !== true) return false
  const agreed = new Set(agreedIds ?? [])
  return terms.filter((item) => item.required).every((item) => agreed.has(item.id))
}

// 가입 요청에 붙일 값 (지금 목록에 있는 id만)
// 예: 약관 [1, 2], 고른 [2, 9] → { agreedTermsVersionIds: [2], ageConfirmed }
export function buildAgreementPayload(terms, agreedIds, ageConfirmed) {
  const known = new Set((terms ?? []).map((item) => item.id))
  return {
    agreedTermsVersionIds: [...new Set(agreedIds ?? [])].filter((id) => known.has(id)),
    ageConfirmed: ageConfirmed === true,
  }
}

// 하나 켜고 끄기 (새 배열)
export function toggleAgreedId(agreedIds, id) {
  const list = agreedIds ?? []
  return list.includes(id) ? list.filter((value) => value !== id) : [...list, id]
}

// 가입 막힘 문구 (약관 못 불러옴 → 약관 → 14세 순)
export function agreementBlockMessage(terms, agreedIds, ageConfirmed) {
  if (!Array.isArray(terms) || terms.length === 0) return "약관을 불러오지 못했습니다. 잠시 후 다시 시도해주세요."
  if (!isAllRequiredAgreed(terms, agreedIds, true)) return "필수 약관에 동의해주세요."
  if (ageConfirmed !== true) return "만 14세 이상인지 확인해주세요."
  return null
}
