// 시스템 알림 줄: "○○님이 죽었습니다" 같은 소식을 가운데 반투명 줄로 (말풍선과 섞이지 않게)
// TalkList가 알림 줄마다 씀
export default function SystemLine({ text }) {
    return (
        <li className="my-2 flex justify-center px-6" data-talk-line="system">
            <p className="rounded-full bg-black/55 px-3 py-1 text-center text-[0.72rem] leading-snug text-[#e8d5b0] ring-1 ring-[#b08a4a]/30">
                {text}
            </p>
        </li>
    )
}
