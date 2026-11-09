// 가입 약관 동의 상태 (지금 약관 불러오기·하나씩/전체 동의·만 14세 확인·전체 보기 창)
// 일반 가입(useLoginPage)·소셜 가입(useSocialSignup)이 씀, 화면은 데스크톱·모바일 약관 칸
import { useCallback, useEffect, useState } from "react"
import { getCurrentTermsApi } from "../../api/terms.api.js"
import {
  agreementBlockMessage, buildAgreementPayload, isAllRequiredAgreed, toggleAgreedId,
} from "../../utils/terms.js"

// active일 때만 불러옴 (로그인 모드에선 안 부름), 실패하면 다시 시도 가능
export function useSignupTerms({ active = true, loadTerms = getCurrentTermsApi } = {}) {
  // 불러온 결과는 몇 번째 시도 것인지 같이 둠 (지금 시도 것이 아니면 "불러오는 중")
  const [loaded, setLoaded] = useState({ attempt: -1, status: "idle", terms: [] })
  const [agreedIds, setAgreedIds] = useState([])
  const [ageConfirmed, setAgeConfirmed] = useState(false)
  const [viewingId, setViewingId] = useState(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!active) return undefined
    let cancelled = false
    loadTerms()
      .then((data) => {
        if (!cancelled) setLoaded({ attempt, status: "ready", terms: Array.isArray(data?.terms) ? data.terms : [] })
      })
      .catch(() => {
        if (!cancelled) setLoaded({ attempt, status: "error", terms: [] })
      })
    return () => { cancelled = true }
  }, [active, attempt, loadTerms])

  const current = loaded.attempt === attempt
  const terms = current ? loaded.terms : []
  let status = "loading"
  if (!active) status = "idle"
  else if (current) status = loaded.status

  const toggle = useCallback((id) => setAgreedIds((prev) => toggleAgreedId(prev, id)), [])

  // 전체 동의: 다 켜져 있으면 다 끄고, 아니면 약관 전부 + 14세 확인 켬
  const allChecked = isAllRequiredAgreed(terms, agreedIds, ageConfirmed)
    && terms.every((item) => agreedIds.includes(item.id))
  const toggleAll = () => {
    if (allChecked) {
      setAgreedIds([])
      setAgeConfirmed(false)
      return
    }
    setAgreedIds(terms.map((item) => item.id))
    setAgeConfirmed(true)
  }

  // 처음 상태로 (가입 끝·모드 바꿈)
  const reset = () => {
    setAgreedIds([])
    setAgeConfirmed(false)
    setViewingId(null)
  }

  return {
    terms,
    status,
    agreedIds,
    ageConfirmed,
    setAgeConfirmed,
    toggle,
    toggleAll,
    allChecked,
    canProceed: isAllRequiredAgreed(terms, agreedIds, ageConfirmed),
    blockMessage: agreementBlockMessage(terms, agreedIds, ageConfirmed),
    buildPayload: () => buildAgreementPayload(terms, agreedIds, ageConfirmed),
    viewing: terms.find((item) => item.id === viewingId) ?? null,
    openTerms: setViewingId,
    closeTerms: () => setViewingId(null),
    retry: () => setAttempt((value) => value + 1),
    reset,
  }
}
