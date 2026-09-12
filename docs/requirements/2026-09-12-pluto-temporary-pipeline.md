# Pluto 임시 작업 지시서·검증 인계 적용 (2026-09-12)

- 실제 소스: C:/dev/pluto/packages/daemon. 기존 수정은 .pluto/monitor/pluto-temporary-pipeline-backup에 원본 그대로 보관. 기존 다른 변경은 되돌리지 않았다.
- 계획 notes 생성 프롬프트에 파일·심볼·입력→저장/이벤트→구독/수신→실제 소비처·회귀 사건 순서·Chrome 시나리오를 요구한다.
- 구현 instruction.md의 계획 기록 바로 아래 작업 지시서를 생성하고 work-order-template.md에도 저장한다. 작업자는 work-order.md에 구체화하고 완료 시 실제 변경·검증 근거를 대조한다. 템플릿의 미확정 위치는 확인 필요로 표시한다.
- runs/verification-handoff.json: 인수 조건, 계획 메모, 사용자 담당 미검증, 명령 결과와 원본 출처를 인계한다. 심사·수동 인수 결과를 자동 PASS로 승계하지 않는다.
- 임시 재사용은 opt-in이다. temporaryVerificationReuse의 environmentRevision, commands, maxAgeMs로 설정한다. 같은 깨끗한 git HEAD/작업본·명령 목록·환경 revision·Node/OS·프로세스 환경·루트/frontend/backend .env* 및 .npmrc 해시만 일치할 때 원본 성공 명령 근거를 재사용한다. 값 자체는 기록하지 않는다.
- 재사용한 결과는 reusedFrom으로 원본 기록에 연결하며 새 실행으로 주장하지 않는다. 실패·생략·만료·미커밋/새 파일·환경 변경은 재사용을 막고, 재사용으로 유효 기간을 연장하지 않는다. 설치·범위·Claude/Codex 심사는 계속 실행한다.
- Joker에서는 frontend 테스트/빌드만 30분 재사용 대상으로 설정했다. DB 테스트와 외부 스크립트는 재사용 대상에서 제외했다. 외부 환경/의존성 구성 변경 시 environmentRevision을 바꾸거나 설정을 삭제해야 한다. 이 revision은 자동 DB 상태 감지가 아니다.
- 해제: .pluto/config.json의 temporaryVerificationReuse 삭제. 코드 롤백은 위 백업과 현재 추가 변경을 비교하여 해당 임시 변경만 되돌린다.
- 검증: 새 회귀 3개 PASS(실제 git fixture 포함), 기존 pack/verify/retry-context/pipeline-rules/gate 34개 PASS, TypeScript build PASS. 로그 .pluto/monitor/pluto-temporary-regression.log.
- 한계: 의미 기반 변경 영향 분석, 독립 심사 결과 재사용, UI의 별도 DEFERRED 배지, 작업 지시서 완료 증거의 기계적 강제 검사는 이번 임시 패치에 포함하지 않는다. 계획/인수 조건 변경은 여전히 정상 심사를 거친다.

추가 보호: dist/frontend/dist/backend/dist의 실제 파일 내용과 node_modules/.package-lock.json도 지문에 포함한다. 산출물 삭제·변경은 재사용을 막는다. 지문 계산 한도를 넘거나 심볼릭 링크로 확인이 불가능하면 재사용하지 않는다. 기존 과거 PASS를 소급해 캐시로 만들지 않으며 적용 후 정상 성공 실행부터 원본 영수증을 생성한다.
