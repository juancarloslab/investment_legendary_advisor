# 매매신호 수신 (TradingView 웹훅) 설정 가이드

`/signals` 페이지는 **TradingView가 보낸 알림을 받아 확인·모니터링**하는 도구입니다.

> ⚠️ **매매 신호가 아닙니다.** 지연 데이터 + 바마감(Once Per Bar Close) 신호를 전제로 하며
> 스캘핑 진입용이 아닙니다. 어떤 신호도 랜덤 대비 우위가 검증되기 전엔 신뢰하지 마세요.
> (이 프로젝트의 빗각 스크리너와 동일한 과학적·비실행 연구 자세를 따릅니다.)

## 동작 개요

```
TradingView (Pine 전략, 알림 = "Once Per Bar Close", 일/주봉)
      │  웹훅 POST (JSON 또는 평문)
      ▼
/api/signals/webhook?token=SECRET   → 시크릿 검증 → 파싱(secret 제거) → 저장
      ▼
저장소: Upstash Redis(영속) 또는 인메모리(미설정 시 폴백)
      ▼
/signals 페이지 + GET /api/signals   → 최신순 피드
```

핵심: 신호 계산은 **TradingView가 자기 데이터로** 합니다. 그래서 우리 앱 데이터(Yahoo, 지연)와
무관하게 동작하고, **마감된 일/주봉 신호는 지연 데이터에서도 100% 유효**합니다(스캘핑만 지연에 취약).

---

## 1. TradingView 연결하는 법

### 1) 2FA 켜기 (필수)
웹훅은 **2FA가 켜져 있어야만** 허용됩니다(안 켜면 알림창의 Webhook URL 칸이 잠김).
- TradingView → 프로필 → **Account Settings → Privacy and Security → 2FA** → 인증앱(SMS보다 권장).

### 2) 플랜
- 웹훅은 **Essential(유료, ~$15/월) 이상**에서 사용 가능(무료 플랜은 알림 1개·웹훅 불가).
- 무료/Essential은 데이터가 **10–15분 지연**되지만, 바마감 일/주봉 신호엔 충분합니다.

### 3) 알림(Alert) 만들기
- Pine 전략/지표에서 알림 생성.
- **Trigger = "Once Per Bar Close"** ← 지연 강건성의 핵심(확정봉에만 발화, 리페인트 없음).
- **타임프레임 = 일봉(1D)/주봉(1W)** 권장.

### 4) 웹훅 URL
알림 생성창의 **Notifications → Webhook URL**에 아래를 입력:
```
https://<your-domain>/api/signals/webhook?token=YOUR_SECRET
```
- `<your-domain>`: 예) `https://investment-advisor-one.vercel.app`
- `YOUR_SECRET`: 임의 문자열. 서버 환경변수 `SIGNALS_WEBHOOK_SECRET`와 **동일**해야 합니다.

### 5) 알림 메시지(JSON 권장)
```json
{"secret":"YOUR_SECRET","ticker":"{{ticker}}","tf":"1D","signal":"bitgak_break","price":"{{close}}","time":"{{timenow}}"}
```
- `{{ticker}}`, `{{close}}`, `{{timenow}}` 등은 TradingView 플레이스홀더.
- **평문도 허용**됩니다(그대로 `note`에 저장).
- 필드 별칭 지원: `ticker|symbol`, `tf|timeframe|interval`, `signal|action|strategy`, `price|close`, `time|timenow`, `note|comment|message`.
- `secret`은 URL의 `?token=` 또는 본문 `"secret"` 중 하나로 보내면 됩니다(둘 다 가능). 저장 시 **secret은 제거**됩니다.

### 6) 전송 확인
- TradingView 알림 로그의 **"Webhook status"** 컬럼으로 전송 성공 여부 확인.
- 앱 `/signals` 페이지에서 수신 신호가 쌓이는지 확인.

---

## 2. Vercel 사용법

### 환경변수 (Vercel Dashboard → Project → Settings → Environment Variables)

| 변수 | 필수 | 설명 |
|---|---|---|
| `SIGNALS_WEBHOOK_SECRET` | 권장 | 웹훅 인증 시크릿. 설정 시 `?token=` 또는 본문 `secret`이 일치해야 수신. **운영 배포 전 반드시 설정.** |
| `UPSTASH_REDIS_REST_URL` | 선택 | Upstash Redis REST URL. 있으면 신호를 **영속 저장**. |
| `UPSTASH_REDIS_REST_TOKEN` | 선택 | Upstash Redis REST 토큰. |

> 레거시 `KV_REST_API_URL` / `KV_REST_API_TOKEN`(구 Vercel KV)도 자동 인식합니다.
> 위 변수가 **없으면 인메모리로 폴백**(서버리스라 배포·콜드스타트마다 초기화 → 로컬/PoC 전용).

### Upstash(영속 저장) 무료로 붙이기
1. Vercel Dashboard → 프로젝트 → **Storage**(또는 Marketplace) → **Upstash** 선택.
2. Redis 데이터베이스 생성(무료 티어: **256MB + 월 50만 커맨드** — 신호 피드엔 차고 넘침).
3. 연결하면 `UPSTASH_REDIS_REST_URL/TOKEN`이 **환경변수로 자동 주입**됩니다.
4. 재배포하면 `/signals` 저장 배지가 **Upstash(영속)** 으로 바뀝니다.

> "Vercel KV"는 2024년 12월 폐지되어 **Upstash로 대체**되었습니다. Hobby(무료) 플랜에서도
> 마켓플레이스로 Upstash 무료 티어를 붙일 수 있습니다.

### 배포
```bash
vercel deploy --prod
```
프로덕션 URL 예시: `https://investment-advisor-one.vercel.app`

### Rate limit 참고
`/api/*`는 IP당 분당 30회 제한(미들웨어). TradingView 웹훅은 보통 그보다 훨씬 드물어 문제없습니다.

---

## 3. 로컬 개발 / 테스트

```bash
npm run dev   # http://localhost:3000

# 웹훅 수신 테스트 (시크릿 미설정 시 개발 모드로 허용)
curl -X POST http://localhost:3000/api/signals/webhook \
  -H 'Content-Type: application/json' \
  -d '{"ticker":"MGC=F","tf":"1D","signal":"bitgak_break","price":"4344.4"}'

# 피드 조회
curl http://localhost:3000/api/signals
```

전체 삭제: `DELETE /api/signals?token=YOUR_SECRET` (시크릿 설정 시 토큰 필요), 또는 `/signals` 페이지의 "전체 삭제".

## 4. 한계 / 디스클레이머
- 수신·모니터링 도구일 뿐, **수익성을 보장하지 않습니다.**
- 지연 데이터 + 바마감 신호 전제 → **스캘핑 진입용 아님**(데이트레이딩 실증연구는 압도적으로 손실 보고).
- 신호 적중률은 **랜덤 베이스라인 대비 우위가 검증**되기 전엔 신뢰 금지(빗각 스크리너와 동일 원칙).
