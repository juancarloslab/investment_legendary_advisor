# Investment Advisor

미국 주식과 ETF를 빠르게 분석하고, 추천 종목·ETF·투자 레전드 관점까지 함께 보는 Next.js 기반 투자 분석 서비스입니다.

> **주의:** 이 프로젝트는 투자 자문이 아니라 데이터 기반 시장 분석 도구입니다. 실제 투자 판단과 책임은 사용자에게 있습니다.

## 주요 화면

- `/` — 단일 종목 통합 분석
  - 차트, 밸류에이션, 시장 심리, 배당/대가 분석을 종합해서 판정
  - 화면 점수는 100점 기준으로 환산 표시하고, 원점수를 함께 제공합니다
- `/discover` — 추천 종목 스크리닝
  - 공포 매수, 저평가, 배당 매력, 모멘텀 리더 등 카테고리별 추천
- `/etf` — ETF 스크리닝
  - ETF 성과/효율/카테고리 기반 추천
- `/legends` — 투자 레전드 전략
  - 버핏, 그레이엄, 린치, 달리오 등 레전드별 후보 종목과 컨센서스
- `/bitgak` — 빗각(주봉 추세선) 패턴 스크리닝 *(연구·가설검증용, 매매 신호 아님)*
  - 전 종목 유니버스에서 저저고/고고저 빗각 패턴을 기계적으로 탐지
  - 추세선 탐지 문헌 기반 선 품질 게이트: ① 무효화(관통) 제약 — 앵커 정의구간에서 선이 가격을 관통하면 가짜 추세선으로 제외, ② 터치 카운팅 — 3터치 이상이면 '확정선', ③ 강도 점수(0–100, 터치 수·밀착도·수명)
  - 돌파 품질: 거래량 동반 돌파(돌파봉 거래량 > 추세평균×1.5)·돌파 후 리테스트 탐지
  - 다음-터치 돌파율을 풀링하고, 선 품질(2터치 vs 3터치+ 확정선)로 층화해 "선 품질이 돌파율을 끌어올리는가"를 합성 널 베이스라인(~25%)과 비교 검정
- `/signals` — 매매신호 수신 피드 *(연구·모니터링용, 매매 신호 아님)*
  - TradingView 웹훅으로 보낸 알림(JSON/평문)을 받아 최신순으로 표시
  - Upstash Redis(구 Vercel KV, 무료 티어) 연결 시 영속 저장, 없으면 인메모리 폴백
  - 설정 방법(TradingView 연결 + Vercel/Upstash): [`docs/signals-webhook.md`](docs/signals-webhook.md)

## 핵심 분석 축

- **차트 분석** — 이동평균선, RSI, 패턴, 시장 breadth
- **밸류에이션 분석** — PER, 적정주가, PEG, 시장 PER 비교
- **시장 심리 분석** — VIX, Put/Call, AAII, Margin Debt, HY Spread
- **배당/전략 분석** — 배당 매력도, 투자 대가 관점 해석

> 빗각(`/bitgak`)은 위 종합 판정 점수에 포함되지 않는 **별도의 연구 도구**입니다.
> 로그 가격 공간에서 주봉 추세선을 탐지할 뿐, 진입/청산 신호가 아닙니다.
> 단일 종목 돌파율은 통계적으로 노이즈(5–48%)와 구분되지 않으니 풀링 통계 맥락에서만 해석하세요.

## 개발 명령어

```bash
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
```

## 데이터/캐시 메모

- 일부 데이터는 Yahoo Finance 및 외부 지표를 기반으로 수집합니다.
- 외부 데이터가 즉시 불가능한 경우, **fallback/추정치**가 사용될 수 있습니다.
- 스크리닝 API는 캐시 및 stale 응답 전략을 일부 사용합니다.
- 현재 캐시와 rate limiting 일부는 **인메모리 기반**이라 서버리스/멀티 인스턴스 환경에서는 영속적이지 않습니다.
- screening 응답은 freshness/fallback 상태와 함께 **reliability / universeMeta / scoreDisplay** 같은 표시용 메타데이터를 포함할 수 있습니다.

## 현재 기술 스택

- Next.js 15 App Router
- React 19
- TypeScript 5
- ESLint 9
- Node built-in test runner
- yahoo-finance2

## 품질 상태

현재 브랜치 기준으로 다음 검증 흐름을 사용합니다.

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`

일부 lint warning은 남아 있을 수 있지만, 코드 변경 작업은 위 검증을 기준으로 진행합니다.

## 최근 릴리즈 문서

- `docs/releases/2026-03-26-trust-and-market-context-update.md`
- `docs/releases/2026-03-26-production-qa-checklist.md`
- `docs/releases/2026-03-26-deployment-announcement-ko.md`
- `docs/releases/2026-03-26-pr-summary.md`
- `docs/postmortems/2026-03-26-yahoo-historical-partial-null.md`
