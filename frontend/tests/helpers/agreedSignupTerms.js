// 시험 도우미: 가입 약관 훅(useSignupTerms)을 "전부 동의한 상태"로 바꿔 끼움
// 가입 흐름만 보는 시험이 씀 (약관 동의 자체는 tests/domains/auth/terms/*.test.js가 봄), mock.module을 넘겨받아 씀

// 가입 요청에 실리는 동의 값
export const AGREED_TERMS_PAYLOAD = Object.freeze({ agreedTermsVersionIds: [1, 2], ageConfirmed: true })

const agreedSignupTerms = () => ({
  terms: [], status: "ready", agreedIds: [1, 2], ageConfirmed: true,
  setAgeConfirmed() {}, toggle() {}, toggleAll() {}, allChecked: true,
  canProceed: true, blockMessage: null, buildPayload: () => ({ ...AGREED_TERMS_PAYLOAD, agreedTermsVersionIds: [1, 2] }),
  viewing: null, openTerms() {}, closeTerms() {}, retry() {}, reset() {},
})

// hooksDirUrl: 시험 파일 기준 src/domains/auth/hooks/terms/useSignupTerms.js 주소
export function mockAgreedSignupTerms(mock, moduleUrl) {
  mock.module(moduleUrl, { namedExports: { useSignupTerms: agreedSignupTerms } })
}
