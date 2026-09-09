# UI-12 인게임 액션 패널·대상 선택·양피지 모달 이식 — 시각 확인 기록

- 상태: **미검증** (브라우저 환경 없음, 스크린샷 없음). AC-06이 요구하는 재투표 라운드 표시와
  생사별 조작 상태는 실제 게임 세션(백엔드·DB·다계정 동시 접속)에서 동률이 나야 재현되므로 이
  환경에서는 확인할 수 없다. UI-16 시각 검증 슬라이스에서 수행한다.
- 대신 확인한 것 (코드·자동 검증, 2026-09-09):
  - 재투표 라운드 표시: `dayVoteRound`가 오르면 훅이 선택값을 초기화하고 대상 목록이
    `buildDayVoteTargets(sessionPlayers, { localPlayerId, excludedUuids })`와 정확히 같아지는지를
    동률→재투표→처형 시나리오 테스트로 검증했다
    (`hooks/__tests__/revoteDayVoteTargets.test.js`: 1라운드 p2~p5 → 재투표 p4·p5 → 처형 후 2일차
    p2·p3·p5). 기존 `liveRevoteControls.test.js`도 그대로 통과한다.
  - 기권: 패널의 기권 버튼은 이식 전과 같은 `abstainDayVote` · 같은 disabled 식
    (`!dayVoteControlsEnabled || dayVoteStatus === "submitting"`)에 물려 있고, 주요 액션
    아웃라인이 붙지 않는 기본 스타일이다(`InGameActionPanel.visualPolish.test.js`).
  - 사망 self 비활성 / 생존 self 준비·대상 선택·제출: 판정원은 이식 전과 같은
    `resolveInGameSelfAliveForControls` 하나이며(`useInGameActionPanel`은 이 슬라이스에서 로직
    변경 없음), 2일차 낮 통합 시나리오 테스트(`dayTwoVoteAliveScenario.test.js`)가 처형자·밤
    사망자에게 `dayVoteControlsEnabled === false`이고 `cast_day_vote`가 나가지 않음을 그대로
    검증한다.
  - 양피지 열림·확인·닫힘: 역할 공개·밤 역할 턴 안내·DAY/NIGHT 진입 세 오버레이가 새 공용 셸
    (`InGameParchmentModalAnimated` / `InGameParchmentModalBase`)을 실제로 쓰도록 배선했고,
    확인 버튼은 공용 `InGameParchmentConfirmButton`(에셋 `/button/버튼(수락 및 긍정).png`)이다.
    backdrop 클릭·Escape·확인 버튼 세 경로 모두 같은 `onDismiss`로 모인다.
    이 셸 체인은 전부 `.js`(createElement)라 jsdom에서 실제로 마운트해 검증했다
    (`components/parchment/__tests__/InGameParchmentModalWiring.test.js`): DAY/NIGHT 진입
    오버레이를 렌더해 backdrop·dialog·양피지 배경 `<img src="/frame/양피지 모달.png">`·공용 확인
    버튼 `<img src="/button/버튼(수락 및 긍정).png">`이 실제 DOM에 나오는 것과, 확인·backdrop·
    Escape 세 경로가 모두 닫기 콜백을 부르는 것을 확인했다. 같은 파일이 `InGamePage`가 세
    오버레이를 각각 한 번씩 마운트하고 오버레이 스택 상태를 그대로 넘기는 것도 고정한다.
    **애니메이션(framer-motion) 연출과 양피지 배경의 실제 픽셀 렌더는 브라우저에서만 확인할 수
    있다 — 여전히 미검증.**
- 원격 대비 전체 이식 대조(파일 목록·파일별 diff)는
  `docs/qa/2026-09-09-ui-12-remote-port-audit.md`에 있다.
- 자동 검증 결과: frontend 테스트 1071개 통과, `npm run build --prefix frontend` 성공,
  backend `test:game-core` 481개 통과.
