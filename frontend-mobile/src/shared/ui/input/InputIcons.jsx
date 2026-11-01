// 입력 칸 앞 아이콘과 비밀번호 보기 아이콘 SVG 모음 (데스크톱 shared/ui/InputIcons와 같은 그림)
// InputSlot과 로그인·가입·계정 찾기·계정 관리 칸이 씀
// 1파일 1컴포넌트 예외: 몇 줄짜리 아이콘을 하나씩 나누면 파일만 늘어서 한곳에 모음 (데스크톱과 같은 이유)
const ICON_CLASS = "h-5 w-5 shrink-0 text-neutral-600"

// 같은 선 굵기·크기 틀 (색은 className으로 바꿈)
function Svg({ className = ICON_CLASS, children }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

// 메일 칸
export function MailIcon({ className }) {
  return <Svg className={className}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></Svg>
}

// 닉네임 칸
export function ProfileIcon({ className }) {
  return <Svg className={className}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6" /></Svg>
}

// 계정 관리 닉네임 칸 (머리·어깨가 조금 큼)
export function UserIcon({ className }) {
  return <Svg className={className}><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></Svg>
}

// 생년월일 칸 (계정 찾기)
export function CalendarIcon({ className }) {
  return <Svg className={className}><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></Svg>
}

// 생년월일 칸 (가입, 데스크톱 SignupCalendarIcon)
export function SignupCalendarIcon({ className }) {
  return <Svg className={className}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></Svg>
}

// 비밀번호 칸
export function LockIcon({ className }) {
  return <Svg className={className}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Svg>
}

// 비밀번호 보기 버튼 (지금 가려진 상태)
export function EyeIcon({ className }) {
  return <Svg className={className}><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" /><circle cx="12" cy="12" r="2.5" /></Svg>
}

// 비밀번호 숨기기 버튼 (지금 보이는 상태)
export function EyeOffIcon({ className }) {
  return (
    <Svg className={className}>
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2.5 2.5 0 0 0 3.5 3.5" />
      <path d="M6.4 6.4C4 8.1 2.5 10 2 12s3.5 6 10 6c1.8 0 3.4-.4 4.8-1.1" />
      <path d="M17.6 17.6C20 15.9 21.5 14 22 12s-3.5-6-10-6c-1.3 0-2.5.2-3.6.6" />
    </Svg>
  )
}
