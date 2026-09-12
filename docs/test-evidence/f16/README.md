# F16 검증 기록

2026-09-12 운영자 검증. 구현 기준 86b88c15 위에 Chrome 재현 결함과 계약 테스트 누락을 수정했다. 최종 전체 테스트와 독립 심사는 Pluto VERIFY의 최종 HEAD 결과를 기준으로 판단한다.

## 실제 외부 Chrome

- production UI/runtime fixture에서 나가기 버튼 1회에 일반 클릭+취소 두 사건이 발생했다. Chrome은 capture와 React callback 사이에 microtask를 실행해 예약 취소 설계를 깨뜨린다. 실제 DOM explicit owner로 수정 후 나가기/생성 뒤로가기 각각 취소 사건 1건. browser/production-ui-before-fix.json 및 after-fix 두 파일. fixture는 native 확인창 취소 이후 콜백을 재현하며 확인창 자체 검증이 아니다.
- 실제 앱 http://127.0.0.1:5183에서 QA API 4183, 격리 DB pluto_f01_20260909_al로 정상 로그인·로비·설정 이동.
- Master 1 / SFX 0 / 효과음 음소거 true를 UI로 변경한 뒤 전체 페이지를 다시 열어 복원 확인. 초기화 후 Master 100 / SFX 80 / 음소거 false. browser/settings-{changed,restored,reset}.json.
- 6인 방을 Chrome UI로 생성하고 정상 소켓 참가 테스트 계정 5명과 전원 준비한 후 게임 시작. 실제 역할 공개 확인·DAY 토론→투표 전환·인게임 설정 열기·효과음 음소거 true 변경·낮 투표 제출 및 화면 반영 확인. browser/game-ready.json, ingame-sound.json, game-vote-muted.json.
- 표시된 미디어의 muted/volume 상태는 settings-reset/ingame-sound에 DOM 관찰값으로 기록했다. 로그인·로비 공통 BGM 제어는 disabled/volume0으로 관찰했다. 설정의 배경음 슬라이더 값 80은 BGM 재생 허용을 뜻하지 않는다. 기존 6개 영상 muted 보존은 코드/회귀검사와 구분한다.
- 실제 게임 나가기 버튼에서 native confirm이 뜬 것을 확인했으나 Chrome 제어 도구의 dismiss 호출이 timeout했다. 브라우저에서 취소 후 잔류/승인 후 이탈을 끝까지 확인했다고 주장하지 않는다. 그 계약은 실제 createExitConfirmController 회귀 테스트로 확인했다.
- QA 참가자와 API는 최종 DB 검사 전에 종료했다. 운영 DB나 스키마는 쓰지 않았다.

## 실행 검증과 한계

- 운영자 전체 frontend: 1646 tests/pass, fail0/skip0. build PASS.
- UI/runtime/loader 집중56개 및 실제 소비 훅3개 PASS. 개인정보 수신자, 중복 사건, 탈락 terminal·stale roster·부활 거부를 실제 훅으로 확인했다. 합산 중복 집계는 하지 않는다.
- 첫 전체 backend는 600초에서 timeout, 응답 sfxEvent 추가에 대한 기대값 갱신 누락 4건. 정확한 envelope 키·ID·계정 검증으로 수정하고 비밀정보 금지 검사는 그대로 유지했다. 소켓188개 PASS, 마지막 격리 DB 파일13개 PASS/정상 종료. 개별 테스트 실행 합571.3초와 준비·정리 비용을 근거로 wrapper 제한만900초로 확장했다. 전체 최종 backend PASS는 공식 VERIFY 결과가 있어야 한다.
- 자산 파일·이용 조건은 아직 미제공이다. 실제 배포 manifest는 needs_assets_and_usage_review로 무음과 사유를 남긴다. mock fixture 성공은 실제 자산 승인/청음이 아니다.
- 로드·play 거절·영구 대기·watchdog 및 Master×SFX 적용은 실제 공통 재생기와 주입 fixture의 자동 테스트로 검증했다. 실제 Chrome에서 모든 브라우저 자동재생 실패를 강제했다는 주장은 하지 않는다.
- F17 신규 알림, F19 실제 초대, F27 전체 능력 영상/MOV5 내장음, F28 통합 검증은 담당 작업의 미완료로 남는다. F15 전체화면은 사용자 직접 검증 예외를 그대로 유지한다.

## 독립 심사 1회 후 보정

- 미검토 자산 검사를 mute/알림 설정보다 먼저 수행한다. 실제 Chrome production runtime에서 mute=true와 asset-unreviewed가 함께 기록됨을 확인했다(browser/muted-unreviewed-after-review.json).
- 볼륨/mute 적용 실패 시 play를 호출하지 않으며 재생 중 실패 시 pause·정리한다. 타이머 설치 실패도 즉시 실패 완료한다.
- 내장음 claim은 매체 하나만 소유하며 범위 변경·release·dispose 이후 attach를 거부하고 기존 매체를 멈춘다.
- 소켓 envelope의 restore 출처를 소비자가 live로 덮어쓰지 않는다. 실제 개인 결과 소비 훅에서 restore 거부 뒤 같은 live ID가 처리되는 회귀를 추가했다.
- 변경 없는 장착/프로필 확인은 효과음을 만들지 않는다. 변경 및 저장 잠금 검사를 통과한 입력에서만 onChanged를 호출한다.
- 보정 후 관련 실제 소비·UI·재생기 회귀 104/104 PASS, fail0/skip0. 이는 전체 재검증을 대체하지 않으며 최종 공식 VERIFY 및 두 독립 심사 결과를 기다린다.
- 이전 공식 npm ci의 EPERM은 검증용 Vite가 네이티브 모듈을 점유한 상태에서 설치를 실행한 운영 순서 오류였다. QA 서버를 종료한 재설치가 성공했고 이번 재검증 전에도 종료했다. 이전 실패 기록은 보존했다.
