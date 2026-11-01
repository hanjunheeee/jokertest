// 입력칸 앞·비밀번호 보기 아이콘 (사람·자물쇠·눈·눈 가림, 데스크톱 InputIcons와 같은 선)
// InputSlot이 씀, 이름으로 고르는 컴포넌트 하나

// 아이콘마다 선 모양만 다름
const PATHS = {
    user: (
        <>
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
        </>
    ),
    lock: (
        <>
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </>
    ),
    eye: (
        <>
            <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
            <circle cx="12" cy="12" r="2.5" />
        </>
    ),
    eyeOff: (
        <>
            <path d="M3 3l18 18" />
            <path d="M10.6 10.6a2.5 2.5 0 0 0 3.5 3.5" />
            <path d="M6.4 6.4C4 8.1 2.5 10 2 12s3.5 6 10 6c1.8 0 3.4-.4 4.8-1.1" />
            <path d="M17.6 17.6C20 15.9 21.5 14 22 12s-3.5-6-10-6c-1.3 0-2.5.2-3.6.6" />
        </>
    ),
}

// 그림만이라 화면 읽기에서 숨김
export default function InputIcon({ name }) {
    return (
        <svg
            className="h-5 w-5 shrink-0 text-neutral-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            {PATHS[name]}
        </svg>
    )
}
