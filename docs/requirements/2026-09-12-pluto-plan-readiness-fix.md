# Pluto 인덱스 누락 대응·계획 준비 관문 수정 — 2026-09-12

## 적용 내용
- 계획 직전 Codebase Memory 갱신을 full 모드로 변경. 현재 프로젝트에서 빠져 있던 planMcpConfig를 로컬 실행 파일 설정에 연결했다.
- 갱신 성공 상태만 믿지 않고 Pluto 코드 지도 파일과 MCP File 노드를 페이지네이션하여 비교한다. 누락 경고·경로는 모든 계획 라운드에 전달한다. 응답 오류는 R-INFRA로 남긴다.
- Codex 계획 프롬프트의 도구 사용 금지 문장과 실제 파일 읽기 지시 충돌을 제거했다. 그래프 검색 실패는 실제 파일 읽기로 확인하고 입력→저장/이벤트→구독→최종 소비처·테스트 계약을 확인하도록 보강했다.
- 새 계획은 readiness.ready / blockers를 반드시 기록한다. 필드 누락, 미완료 선언, 남은 blockers는 자동 진행을 막고 R-PLAN으로 처리한다. 같은 반려 반복은 기존 사람 확인 정책을 따른다. 수동 계획 승인도 명시된 준비 미완료를 통과시키지 않는다.
- 독립 심사에도 필수 소비처·데이터 흐름·테스트 계약의 미확정을 차단 사유로 명시했다. 정직한 unsure 자체가 PASS 근거가 되지 않는다. 정상 구현 후 시험과 사용자 담당 전체화면 검증은 준비 차단과 구분한다.
- 기존 계획 데이터는 호환성을 유지한다. 새 계획에는 readiness가 필수이며 기존 계획도 명시적 not-ready 문구는 차단한다. 모델이 거짓으로 ready를 선언하는 모든 누락을 정적으로 검출하는 기능은 아니다.
- 구현 지시서에 워크트리 별도 project 색인 및 메인 그래프 대체 금지를 추가했다. 미래 모든 워크트리의 자동 색인 실행기를 새로 만든 것은 아니다.

## 실제 인덱스 검증
- 로컬 서버: C:/Users/minsa/AppData/Local/Programs/codebase-memory-mcp/codebase-memory-mcp.exe.
- main full 재인덱싱: 5882 nodes / 9637 edges. useBgmAutoplay, useLobbyMenuNav는 여전히 검색 0건. full 요청도 기존 캐시를 완전히 초기화한다는 보장은 없으며 잔여 누락의 내부 원인은 미확정이다. 인덱스 전체가 복구됐다고 주장하지 않는다.
- AZ full 재인덱싱: 11042 nodes / 23121 edges. 위 두 훅의 Function·File·Module 검색 성공, 총 7개 결과.
- 새 실제 로컬 CLI 경로도 실행 검증: refresh 성공, missingGraphFiles가 main의 두 누락 파일을 정확히 반환했다. 따라서 다음 계획은 이 누락을 숨기지 않고 직접 파일 확인 경로를 사용한다.
- 최초 재인덱싱은 자동 검토에서 외부 전송 우려로 거절됐다. 실제 로컬 실행 파일 설정을 확인한 뒤 동일 MCP 요청이 승인·완료됐다. 우회 실행하지 않았다.

## 검증·배포
- TypeScript 빌드 PASS.
- plan / codex-plan / pack / gate / retry-context 총 48 tests PASS, 실패·skip 0.
- 실제 임시 daemon을 통한 not-ready 자동 차단 및 수동 승인 거부, 정상 계획 승인, MCP 페이지네이션/잘못된 응답 검증 포함.
- 로그: .pluto/monitor/plan-readiness-tests-green.log. 이전 실패 로그도 보존했다. API 50ms 타임아웃 시험은 MCP 프로세스 시작을 분리하여 해당 API 실패 계약을 검증한다.
- 실행 중인 슬라이스가 없음을 확인하고 공식 stop → stopped 확인 → start --detach. 기존 PID 13368 종료, 새 PID 5320 / port 1221.
- 기존 배치·슬라이스 상태 직접 편집 없음. F15/AZ RESULT human, 14/29 완료 유지. F15 화면은 이번 Pluto 수정에서 바꾸지 않았다. 기존 실제 Chrome 증거·사용자 전체화면 미검증 예외 보존.

## 백업·복원
이번 수정 직전 소스는 .pluto/monitor/plan-readiness-backup/에 파일별 보관했다. 설정은 plan-readiness-config-before.json. 이전 임시 작업 지시서/검증 재사용 변경과 기존 미커밋 변경은 보존했다. 복원 필요 시 이 백업과 현재 diff를 대조해 이번 변경만 되돌리고 빌드·테스트 후 대기 시점에 단일 daemon을 교체한다.
