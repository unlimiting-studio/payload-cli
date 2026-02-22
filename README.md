# payload-cli

Payload CMS REST API를 다루는 간단한 CLI입니다.

지원 기능:
- `auth:login`: 도메인/이메일/비밀번호 인증 및 로컬 저장
- `auth:status`: 저장된 기본 인증 정보 확인
- `media:upload`: 파일 업로드 (`/api/media`)
- `post:create`: 포스트(또는 임의 컬렉션 문서) 생성

## 설치

```bash
npm install
npm link
```

## 인증 정보 저장

최초 1회 로그인:

```bash
payload-cli auth:login --domain https://your-payload-domain.com --email you@example.com --password 'your-password'
```

저장 경로:
- macOS/Linux: `~/.config/payload-cli/credentials.json`

이후 명령 실행 시 저장된 정보로 자동 로그인합니다.

## 파일 업로드

```bash
payload-cli media:upload --file ./cover.png --alt "커버 이미지"
```

도메인/계정을 덮어쓰려면 옵션 추가:

```bash
payload-cli media:upload \
  --domain https://your-payload-domain.com \
  --email you@example.com \
  --password 'your-password' \
  --file ./cover.png \
  --alt "커버 이미지"
```

## 포스트 작성

기본 컬렉션은 `posts`입니다.

```bash
payload-cli post:create \
  --title "첫 글" \
  --content "안녕하세요" \
  --status published \
  --slug first-post
```

업로드한 media id를 연결할 때:

```bash
payload-cli post:create \
  --title "이미지 포함 글" \
  --content "본문" \
  --media-id 12 \
  --media-field featuredImage
```

컬렉션이 다르면 `--collection`으로 지정하세요.

```bash
payload-cli post:create --collection announcements --title "공지" --content "내용"
```

추가 필드가 필요하면 `--data` JSON으로 덮어쓸 수 있습니다.

```bash
payload-cli post:create \
  --title "커스텀" \
  --content "본문" \
  --data '{"author":"team","tags":["notice"]}'
```

## 보안 주의

요구사항에 맞춰 계정 정보를 로컬 파일에 저장합니다. 운영 환경에서는 전용 서비스 계정 사용을 권장합니다.
