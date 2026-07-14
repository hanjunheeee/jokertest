import {
  MY_PAGE_BANNER_LABEL_TEXT_CLASS,
  MY_PAGE_BANNER_REPUTATION_TEXT_CLASS,
  MY_PAGE_BANNER_TEXT_ALIGN_LEFT_CLASS,
  MY_PAGE_BANNER_TEXT_INSET_LEFT,
  MY_PAGE_BANNER_TEXT_SHADOW,
  MY_PAGE_BANNER_TITLE_TEXT_CLASS,
} from "@/domains/user/constants/myPageBannerStyle.js"

function StatusDivider() {
  return (
    <div
      className="mr-[12%] h-px shrink-0 bg-gradient-to-r from-[#c8b898]/65 via-[#c8b898]/45 to-transparent"
      style={{ marginLeft: MY_PAGE_BANNER_TEXT_INSET_LEFT }}
      aria-hidden="true"
    />
  )
}

// 배너 이미지 위에 프로필 문구, 명성, 칭호를 올려 보여주는 영역입니다.
export default function BannerTextPanel({ profile, textPanelInset }) {
  // 배너에 표시할 프로필 문구, 명성 값, 칭호를 꺼냅니다.
  // reputationLabel: "플레이어 닉네임" 같은 위쪽 문구입니다.
  // reputationValue: 명성 숫자입니다.
  // title: 사용자 칭호입니다.
  const { reputationLabel, reputationValue, title } = profile

  return (
    // 텍스트 영역은 배너 클릭을 막으면 안 되므로 pointer-events-none을 둡니다.
    <div className="pointer-events-none absolute grid grid-rows-[1fr_auto_1fr]" style={textPanelInset}>
      <div className="relative h-full min-h-0 w-full">
        {/* 배너 위쪽에 표시되는 프로필 문구입니다. */}
        <p
          className={`absolute ${MY_PAGE_BANNER_TEXT_ALIGN_LEFT_CLASS} top-1/2 -translate-y-1/2 ${MY_PAGE_BANNER_LABEL_TEXT_CLASS}`}
          style={{ textShadow: MY_PAGE_BANNER_TEXT_SHADOW }}
        >
          {reputationLabel}
        </p>
      </div>

      {/* 위쪽 프로필 문구와 아래쪽 명성/칭호 영역을 나눠주는 선입니다. */}
      <StatusDivider />

      <div className="relative h-full min-h-0 w-full">
        {/* 배너 아래쪽 왼쪽에 표시되는 명성 값입니다. */}
        <p
          className={`absolute ${MY_PAGE_BANNER_TEXT_ALIGN_LEFT_CLASS} top-[14%] ${MY_PAGE_BANNER_REPUTATION_TEXT_CLASS}`}
          style={{ textShadow: MY_PAGE_BANNER_TEXT_SHADOW }}
        >
          명성 {reputationValue}
        </p>

        {/* 배너 아래쪽 오른쪽에 표시되는 칭호입니다. 길면 말줄임 처리합니다. */}
        <p
          className={`absolute left-[52%] top-[13%] max-w-[52%] truncate text-left ${MY_PAGE_BANNER_TITLE_TEXT_CLASS}`}
          style={{ textShadow: MY_PAGE_BANNER_TEXT_SHADOW }}
        >
          {title}
        </p>
      </div>
    </div>
  )
}
