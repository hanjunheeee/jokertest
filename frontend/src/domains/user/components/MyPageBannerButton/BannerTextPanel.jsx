import {
  MY_PAGE_BANNER_LABEL_TEXT_CLASS,
  MY_PAGE_BANNER_TEXT_ALIGN_LEFT_CLASS,
  MY_PAGE_BANNER_TEXT_SHADOW,
} from "../../constants/myPageBannerStyle.js"

/**
 * 배너 이미지 위에 닉네임을 올려 보여주는 영역입니다.
 *
 * F-30 AC-04: 예전에는 세 트랙 grid(닉네임 / 구분선 / "명성 N")였다. 명성이 화면에서
 * 제거되면서 문단·구분선뿐 아니라 **그 자리까지** 없앤다 — 트랙만 남기면 배너 안에 빈 줄이
 * 생기고 닉네임이 위로 쏠린다. 닉네임 하나를 기존 inset 안에서 세로 중앙에 둔다.
 *
 * 긴 닉네임은 잘라내지 않고 영역 안에서 줄바꿈한다(AC-06) — 최대 8자 닉네임이 확대 글자·좁은
 * 화면에서 배너 밖으로 넘치지 않게 한다. 사진·테두리·설정 버튼은 형제 컴포넌트의 몫이라
 * 이 변경과 무관하다.
 *
 * 줄바꿈 규칙이 overflow-wrap:anywhere인 이유(CODEX 재검토): 처음 쓴 break-keep은
 * word-break:keep-all이라 **공백 없는 한글 글자 사이의 줄바꿈을 오히려 막는다**. 닉네임은
 * 2~8자(backend/validation/signupValidation.js)이고 공백이 하나도 없는 경우가 흔하므로,
 * keep-all 아래에서는 닉네임 전체가 쪼갤 수 없는 한 덩어리가 되어 max-w-full이 있어도
 * 배너 밖으로 넘친다(확대 글자·좁은 화면에서 레이아웃이 깨진다). overflow-wrap:anywhere는
 * 달리 접을 곳이 없을 때만 글자 사이에서 접으므로 한글·영문 어느 쪽이든 영역 안에 머문다 —
 * 인게임 채팅 본문(ingameChatLayout.js)이 이미 쓰는 같은 관례다.
 */
export default function BannerTextPanel({ profile, textPanelInset }) {
  const { nickname } = profile

  return (
    <div className="pointer-events-none absolute flex items-center" style={textPanelInset}>
      <p
        className={`relative ${MY_PAGE_BANNER_TEXT_ALIGN_LEFT_CLASS} max-w-full [overflow-wrap:anywhere] ${MY_PAGE_BANNER_LABEL_TEXT_CLASS}`}
        style={{ textShadow: MY_PAGE_BANNER_TEXT_SHADOW }}
      >
        {nickname}
      </p>
    </div>
  )
}
