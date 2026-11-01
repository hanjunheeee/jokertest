// 계정 패널 칸 제목 (닉네임 변경·비밀번호 변경·Discord 계정 연결)
// 계정 칸 세 개가 씀

// 양피지 위라 검은 글자 (데스크톱과 같음)
export default function SectionTitle({ children }) {
    return (
        <h2 className="font-subheading app-text-scaled [--app-text-size:0.95rem] font-bold text-black">
            {children}
        </h2>
    )
}
