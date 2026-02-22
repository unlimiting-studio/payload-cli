# payload

Payload CMS REST/GraphQL API를 다루는 CLI입니다.

지원 기능:
- `payload auth login`
- `payload auth status`
- `payload collections list`
- `payload <collection>:create`
- `payload <collection>:list`
- `payload <collection>:schema`
- `payload <collection>:publish <id>`
- `payload <collection>:unpublish <id>`

## 설치

```bash
npm install
npm link
```

## 인증 정보 저장

최초 1회 로그인:

```bash
payload auth login --domain https://your-payload-domain.com --email you@example.com --password 'your-password'
```

저장 경로:
- macOS/Linux: `~/.config/payload/credentials.json`

이후 명령 실행 시 저장된 정보로 자동 로그인합니다.

## 컬렉션 목록 조회

```bash
payload collections list
```

GraphQL introspection 기반 추정 목록입니다.

## 컬렉션별 문서 생성

```bash
payload foobars:create --title "제목" --content "본문"
```

로케일 지정:

```bash
payload foobars:create --lang ko --title "제목" --content "본문"
```

파일을 업로드하고 문서에 자동 연결:

```bash
payload foobars:create \
  --title "제목" \
  --content "본문" \
  --file ./cover.png \
  --alt "커버 이미지" \
  --media-field featuredImage
```

## 컬렉션 목록 조회(페이징)

```bash
payload foobars:list --page 3 --limit 30
```

## 컬렉션 스키마 조회

```bash
payload foobars:schema
```

1차로 GraphQL introspection을 시도하고, 실패하면 샘플 문서 키 기반으로 fallback합니다.

## 퍼블리시 / 언퍼블리시

```bash
payload foobars:publish 1
payload foobars:unpublish 1
```

기본 동작은 `status` 필드를 각각 `published` / `draft`로 업데이트합니다.
필드명/값이 다르면 옵션으로 조정할 수 있습니다.

```bash
payload foobars:publish 1 --status-field state --published-value live
payload foobars:unpublish 1 --status-field state --draft-value hidden
```

## 보안 주의

요구사항에 맞춰 계정 정보를 로컬 파일에 저장합니다. 운영 환경에서는 전용 서비스 계정 사용을 권장합니다.
