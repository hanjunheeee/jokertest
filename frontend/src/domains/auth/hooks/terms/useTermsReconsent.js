// 로그인 뒤 약관 재동의 확인 (새 필수 버전이 있으면 목록, 동의 보내기)
// 데스크톱·모바일 App의 재동의 창이 씀, 확인 실패는 조용히 넘김 (서버가 막지 않음)
import { useEffect, useState } from "react"
import { useAuthStore } from "../../store/auth.store.js"
import { agreeTermsApi, getMyPendingTermsApi } from "../../api/terms.api.js"

// 로그인한 계정(uuid)이 바뀔 때마다 다시 봄
export function useTermsReconsent({ loadPending = getMyPendingTermsApi, sendAgreement = agreeTermsApi } = {}) {
  const accountUuid = useAuthStore((state) => (state.isLoggedIn ? state.user?.uuid ?? null : null))
  // 불러온 결과는 어느 계정 것인지 같이 둠 (계정이 바뀌면 옛 목록 안 보임)
  const [result, setResult] = useState({ uuid: null, pending: [] })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!accountUuid) return undefined
    let cancelled = false
    loadPending()
      .then((data) => {
        if (!cancelled) setResult({ uuid: accountUuid, pending: Array.isArray(data?.pending) ? data.pending : [] })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [accountUuid, loadPending])

  const pending = accountUuid && result.uuid === accountUuid ? result.pending : []

  // 보이는 필수 버전 전부 동의 → 남은 목록으로 바꿈 (약관이 그사이 바뀌면 새 목록 다시 받음)
  const agree = async () => {
    if (submitting || pending.length === 0) return
    setSubmitting(true)
    setError(null)
    try {
      const data = await sendAgreement(pending.map((item) => item.id))
      setResult({ uuid: accountUuid, pending: Array.isArray(data?.pending) ? data.pending : [] })
    } catch (err) {
      const fresh = err?.code === "TERMS_VERSION_OUTDATED" ? await loadPending().catch(() => null) : null
      if (fresh) setResult({ uuid: accountUuid, pending: Array.isArray(fresh.pending) ? fresh.pending : [] })
      setError(err?.message || "동의를 저장하지 못했습니다. 다시 시도해주세요.")
    } finally {
      setSubmitting(false)
    }
  }

  return { pending, required: pending.length > 0, agree, submitting, error }
}
