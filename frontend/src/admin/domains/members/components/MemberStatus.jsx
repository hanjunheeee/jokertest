// 회원 상태 표시 부품 파일, 접속 중 · 정지 중 · 탈퇴함 · 보통을 글자 딱지로 (색만으로 안 알리게 글자 같이)
// 회원 찾기 목록(MembersPage)·회원 상세(MemberDetailPage)가 씀
const BADGE = 'inline-flex items-center rounded border px-2 py-0.5 text-xs font-semibold whitespace-nowrap'

// member: { online, banned?, withdrawn, status } → 딱지 여러 개 (예: 접속 중 + 정지 중)
export default function MemberStatus({ member }) {
  if (member.withdrawn) return <span className={`${BADGE} border-line text-muted`}>탈퇴함</span>
  const badges = []
  if (member.online) badges.push(<span key="online" className={`${BADGE} border-accent text-accent`}>접속 중</span>)
  if (member.banned) badges.push(<span key="banned" className={`${BADGE} border-danger text-danger`}>정지 중</span>)
  if (member.status && member.status !== 'ACTIVE') {
    // ACTIVE 아닌 상태는 로그인이 막힘 (상태 값은 마우스 올리면 보임)
    badges.push(<span key="status" title={member.status} className={`${BADGE} border-line text-muted`}>이용 막힘</span>)
  }
  if (badges.length === 0) badges.push(<span key="idle" className={`${BADGE} border-line text-muted`}>접속 안 함</span>)
  return <span className="inline-flex flex-wrap gap-1">{badges}</span>
}
