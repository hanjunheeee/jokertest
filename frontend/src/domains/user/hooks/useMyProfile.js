import { useEffect, useState } from "react"
import { getMyProfileApi } from "../api/user"

/**
 * 마이페이지에 필요한 프로필 데이터를 서버에서 가져오는 훅.
 *
 * 반환값:
 *   profile  — MyPageBannerButton의 profile prop 형태 { reputationLabel, reputationValue, title }
 *   stats    — BloodRecordFrame의 stats prop 형태 [{ label, value }]
 *   description — FateMaskFooter의 description prop 형태 { prefix, highlight, suffix }
 *   loading  — 최초 로딩 중 여부
 */
export function useMyProfile() {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getMyProfileApi()
      .then((res) => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (!data) {
    return { profile: null, stats: null, description: null, loading }
  }

  const profile = {
    reputationLabel: `플레이어 ${data.nickname}`,
    reputationValue: data.reputation,
    title:           data.title,
  }

  const stats = [
    { label: "전체 판수",    value: data.total_games.toLocaleString() },
    { label: "생존 횟수",    value: data.survival_count.toLocaleString() },
    { label: "단두대 처형",  value: data.execution_count.toLocaleString() },
  ]

  const description = {
    prefix:    "이 자는",
    highlight: data.most_played_role ?? "???",
    suffix:    "의 가면을 쓸 때 가장 잔혹합니다.",
  }

  return { profile, stats, description, loading }
}
