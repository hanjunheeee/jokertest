// 파일 역할: UserIcon.jsx - 화면을 구성하는 컴포넌트입니다.
// 닉네임 입력칸 왼쪽에 표시하는 사용자 아이콘입니다.
export default function UserIcon() {
  return (
    <svg className="h-[20px] w-[20px] shrink-0 text-neutral-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  )
}
