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
  // useState(초기값)은 [현재값, 값을 바꾸는 함수] 쌍을 반환하는 훅으로,
  // 값을 바꾸는 함수를 호출하면 이 훅을 쓰는 컴포넌트가 다시 렌더링됩니다.
  // data: 서버에서 받아온 프로필 원본 데이터 (아직 없으면 null)
  const [data, setData]       = useState(null)
  // loading: 최초 API 요청이 끝났는지 여부 (끝나기 전까지 true)
  const [loading, setLoading] = useState(true)

  // useEffect(콜백, 의존성배열)는 렌더링 이후 "부수 효과"(여기서는 API 호출)를 실행하는 훅입니다.
  // 의존성 배열이 빈 배열([])이면 컴포넌트가 처음 마운트될 때 딱 한 번만 실행됩니다.
  useEffect(() => {
    getMyProfileApi()
      .then((res) => setData(res))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (!data) {
    return { profile: null, stats: null, description: null, loading }
  }

  // 서버 응답(data)을 각 하위 컴포넌트가 바로 받을 수 있는 prop 모양으로 변환
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
