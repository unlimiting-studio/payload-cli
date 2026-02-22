# payload

Payload CMS REST/GraphQL API를 다루는 CLI입니다.

주요 명령:
- `payload auth login`
- `payload auth status`
- `payload collections list`
- `payload create <collection>`
- `payload export <collection> <id>`
- `payload list <collection>`
- `payload schema <collection>`
- `payload publish <collection> <id>`
- `payload unpublish <collection> <id>`

## 설치

```bash
npm install
npm link
```

## 인증 정보 저장

최초 1회 로그인:

```bash
payload auth login --domain https://your-payload-domain.com --email you@example.com
```

`--password`를 생략하면 비밀번호는 **숨김 입력**으로 받습니다.

저장 경로:
- macOS/Linux: `~/.config/payload/credentials.json`

## 컬렉션 목록 조회

```bash
payload collections list
```

GraphQL introspection을 우선 시도하고, 실패 시 REST `/api/access` 기반 fallback을 사용합니다.

## 문서 생성

```bash
payload create foobars --title "제목" --content "본문"
```

로케일 지정:

```bash
payload create foobars --lang ko --title "제목" --content "본문"
```

마크다운 파일로 생성(로컬 이미지 자동 업로드):

```bash
payload create posts --md --input ./post.md
```

필요 시 제목/슬러그 덮어쓰기:

```bash
payload create posts --md --input ./post.md --title "직접 지정 제목" --slug custom-slug
```

`post.md` 안의 `![alt](./image.png)` 형식 로컬 이미지는 `media`에 자동 업로드되고 본문 `upload` 노드로 치환됩니다.

## 문서 내보내기

JSON 출력:

```bash
payload export posts 1
payload export posts 1 --output ./post-1.json
```

마크다운 출력:

```bash
payload export posts 1 --md --output ./post-1.md
```

## 목록 조회

```bash
payload list foobars --page 3 --limit 30
```

## 스키마 조회

```bash
payload schema foobars
```

## 퍼블리시 / 언퍼블리시

```bash
payload publish foobars 1
payload unpublish foobars 1
```

상태 필드/값이 다른 프로젝트에서는 옵션으로 조정:

```bash
payload publish foobars 1 --status-field state --published-value live
payload unpublish foobars 1 --status-field state --draft-value hidden
```

## 보안 주의

운영 환경에서는 전용 서비스 계정 사용을 권장합니다.
