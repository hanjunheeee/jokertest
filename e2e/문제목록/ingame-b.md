# 문제 목록 — 인게임 B (밤·직업·승패)

2단계 브라우저 시험(desktop 1280×800, `e2e/tests/ingame/b-night/`)에서 나온 앱 문제. 앱 코드는 안 고침, 3단계에서 감독이 모아서 고침.

| 번호 | 시험 이름 | 재현 순서 | 기대 | 실제 | 의심 파일:줄 | 심각도 |
|---|---|---|---|---|---|---|
| 1 | doctor › 의사인 내가 의사 차례에 내 카드를 누르면 → 보호 항목이 있어 나를 살릴 수 있음 (서버는 의사 자기 보호 허용) | 의사로 판 시작 → 첫 밤 의사 차례 → 내 카드(‘나’ 표시) 누르기 | 카드 메뉴에 ‘보호’가 떠서 나를 보호할 수 있음 (서버 `SELF_TARGET_ROLES`에 DOCTOR, 대상 목록 `buildNightActionTargets`도 의사는 나를 넣음, 봇은 자기 보호 성공) | 내 카드는 메뉴가 아예 안 열림 → 사람 의사는 화면으로 자기 보호를 못 함 (봇만 가능) | frontend/src/domains/game/ingame/utils/playerCardMenu.js:128 (`phase === "NIGHT" && ctx.isNightTurnActor && !isSelf` — 의사 예외 없음), 설계 F-34 §2 "본인 카드는 밤 행동 항목을 안 보임"이 서버 규칙(backend/game-core/phase/night/constants.js:23)과 어긋남 | 중간 (의사 규칙 하나를 사람이 못 씀) |
| 2 | night-result › 의사 없는 판에서 광대가 나를 죽이면 → 내 화면에 암살 연출 뒤 "최종 결과, 사망했습니다." 창이 뜸 | 의사가 없는 구성(예: 자동 4인·광대 1) → 첫 밤 광대가 사람 시민을 암살 → 아침 | 의사 있는 판처럼 암살 영상 뒤 "최종 결과, 사망했습니다." 창 (의사 있는 판·의사 살림 판은 뜸) | 암살 영상만 뜨고 최종 결과 창이 끝내 안 뜸. 최종 결과는 '치료 봄' 또는 '의사 차례 끝(night_turn_ended DOCTOR)'을 기다리는데, 의사가 없는 판은 의사 차례 자체가 없어 영영 안 옴. 광대(USER 시점)도 같은 이유로 의사 없는 판에선 최종 결과를 못 봄 | frontend/src/domains/game/ingame/hooks/useInGameNightSuccessPresentation.js:22·121-124 (`HEAL_WINDOW_CLOSING_ROLE = "DOCTOR"` 끝 알림만 치료 마감으로 봄, 밤 결과 반영·판 구성에 의사 없음은 안 봄) | 낮음 (죽은 건 카드·사망 후 선택 창으로는 앎) |

## 참고 (앱 문제 아님, 시험 바탕)

- 역할 미리 정하기(`/e2e/role-presets`)는 서버 전체가 같이 쓰는 표이고 서로 바꿔 끼우는 방식이라, 여럿 정하면 가끔 못 맞추고(서로 원하는 역할을 쥔 경우) 다른 시험의 `clearRoles()`(전부 지우기)와 겹치면 사라짐. b-night는 `_night.js`의 `setup()`이 서버 역할을 읽어 봇 순서를 다시 맞추고, 사람 역할이 틀리면 새 계정·새 창으로 다시 차림(3번까지).
- 여러 에이전트가 같은 `e2e/test-results`를 쓰면 실행 시작 때 서로 지워 trace·사진이 사라짐(ENOENT). b-night는 `--output`을 따로 줘서 돌렸음.
- 판 시험 하나가 PC 부하 때 30~60초. 광대 수는 서버가 1~2명만 받음(`backend/validations/room/create.js:11`) — 3명 방은 거절되는지만 시험함.
