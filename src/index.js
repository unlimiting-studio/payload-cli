#!/usr/bin/env node
import { Command } from 'commander'
import process from 'node:process'
import readline from 'node:readline'
import { createInterface } from 'node:readline/promises'

import {
  getConfigFilePath,
  getDefaultDomain,
  getProfile,
  normalizeDomain,
  upsertProfile,
} from './lib/config.js'
import {
  createDocument,
  getCollectionSchema,
  listCollections,
  listDocuments,
  loginWithPassword,
  updateDocument,
} from './lib/payload.js'

function printError(error) {
  const status = error?.response?.status
  const payloadMessage =
    error?.response?.data?.errors?.[0]?.message ||
    error?.response?.data?.error ||
    error?.response?.data?.message

  if (status) {
    console.error(`요청 실패 (${status}): ${payloadMessage || error.message}`)
    return
  }

  console.error(`요청 실패: ${error?.message || String(error)}`)
}

function parseJsonObject(value, label) {
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`${label}는 JSON 객체여야 합니다.`)
    }
    return parsed
  } catch (error) {
    throw new Error(`${label} 파싱 실패: ${error.message}`)
  }
}

async function promptText(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return await rl.question(question)
  } finally {
    rl.close()
  }
}

async function promptHidden(question) {
  if (!process.stdin.isTTY) {
    return promptText(question)
  }

  return new Promise((resolve, reject) => {
    const stdin = process.stdin
    const stdout = process.stdout
    let value = ''

    const cleanup = () => {
      stdin.removeListener('keypress', onKeypress)
      if (stdin.isTTY) stdin.setRawMode(false)
      stdin.pause()
    }

    const onKeypress = (str, key) => {
      if (key?.name === 'return' || key?.name === 'enter') {
        stdout.write('\n')
        cleanup()
        resolve(value)
        return
      }

      if (key?.name === 'backspace') {
        value = value.slice(0, -1)
        return
      }

      if (key?.ctrl && key?.name === 'c') {
        stdout.write('^C\n')
        cleanup()
        reject(new Error('입력이 취소되었습니다.'))
        return
      }

      if (typeof str === 'string' && str.length > 0) {
        value += str
      }
    }

    readline.emitKeypressEvents(stdin)
    stdin.setRawMode(true)
    stdin.resume()
    stdout.write(question)
    stdin.on('keypress', onKeypress)
  })
}

async function promptForMissing({ domain, email, password }) {
  const nextDomain = domain || (await promptText('Payload 도메인 (예: https://example.com): '))
  const nextEmail = email || (await promptText('이메일: '))
  const nextPassword = password || (await promptHidden('비밀번호: '))

  return {
    domain: normalizeDomain(nextDomain),
    email: nextEmail.trim(),
    password: nextPassword,
  }
}

async function resolveAuth({ domain, email, password, allowPrompt = true }) {
  const normalizedDomain = normalizeDomain(domain)
  const stored = getProfile(normalizedDomain)

  let resolvedDomain = normalizedDomain || stored?.domain || getDefaultDomain()
  let resolvedEmail = email || stored?.email
  let resolvedPassword = password || stored?.password

  if ((!resolvedDomain || !resolvedEmail || !resolvedPassword) && allowPrompt) {
    const prompted = await promptForMissing({
      domain: resolvedDomain,
      email: resolvedEmail,
      password: resolvedPassword,
    })

    resolvedDomain = prompted.domain
    resolvedEmail = prompted.email
    resolvedPassword = prompted.password
  }

  if (!resolvedDomain || !resolvedEmail || !resolvedPassword) {
    throw new Error('도메인/이메일/비밀번호 정보가 부족합니다. 먼저 payload auth login을 실행해주세요.')
  }

  const login = await loginWithPassword({
    domain: resolvedDomain,
    email: resolvedEmail,
    password: resolvedPassword,
  })

  upsertProfile({
    domain: resolvedDomain,
    email: resolvedEmail,
    password: resolvedPassword,
    setDefault: true,
  })

  return {
    domain: resolvedDomain,
    email: resolvedEmail,
    token: login?.token,
    user: login?.user,
  }
}

function maybeParseContent(contentValue) {
  if (typeof contentValue !== 'string') return contentValue
  const trimmed = contentValue.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return contentValue

  try {
    return JSON.parse(contentValue)
  } catch {
    return contentValue
  }
}

function withAuthOptions(command) {
  return command
    .option('-d, --domain <domain>', 'Payload 도메인')
    .option('-e, --email <email>', '로그인 이메일 (저장값 우선)')
    .option('-p, --password <password>', '로그인 비밀번호 (저장값 우선)')
}

const program = new Command()

program
  .name('payload')
  .description('Payload CMS CLI')
  .version('0.3.0')

const auth = new Command('auth').description('인증 관련 명령')

auth
  .command('login')
  .description('도메인/계정으로 인증하고 로컬에 자격증명을 저장합니다.')
  .option('-d, --domain <domain>', 'Payload 도메인 (예: https://example.com)')
  .option('-e, --email <email>', '로그인 이메일')
  .option('-p, --password <password>', '로그인 비밀번호 (미입력 시 숨김 프롬프트)')
  .action(async (options) => {
    try {
      const authResult = await resolveAuth({
        domain: options.domain,
        email: options.email,
        password: options.password,
      })

      console.log(`인증 성공: ${authResult.user?.email || authResult.email}`)
      console.log(`기본 도메인: ${authResult.domain}`)
      console.log(`저장 경로: ${getConfigFilePath()}`)
    } catch (error) {
      printError(error)
      process.exitCode = 1
    }
  })

auth
  .command('status')
  .description('저장된 기본 도메인과 계정 정보를 확인합니다.')
  .action(() => {
    const profile = getProfile()
    if (!profile) {
      console.log('저장된 인증 정보가 없습니다. payload auth login을 먼저 실행하세요.')
      return
    }

    console.log(`기본 도메인: ${profile.domain}`)
    console.log(`이메일: ${profile.email}`)
    console.log(`저장 경로: ${getConfigFilePath()}`)
  })

program.addCommand(auth)

const collections = new Command('collections').description('컬렉션 메타 정보 명령')

withAuthOptions(
  collections
    .command('list')
    .description('사용 가능한 컬렉션을 조회합니다. (GraphQL + REST fallback)')
    .action(async (options) => {
      try {
        const authResult = await resolveAuth({
          domain: options.domain,
          email: options.email,
          password: options.password,
        })

        const names = await listCollections({
          domain: authResult.domain,
          token: authResult.token,
        })

        if (!names.length) {
          console.log('조회된 컬렉션이 없습니다. 도메인/API 접근 권한을 확인해주세요.')
          return
        }

        names.forEach((name) => console.log(name))
      } catch (error) {
        printError(error)
        process.exitCode = 1
      }
    }),
)

program.addCommand(collections)

withAuthOptions(
  program
    .command('create')
    .description('컬렉션에 문서를 생성합니다.')
    .argument('<collection>', '컬렉션 slug')
    .requiredOption('--title <title>', '문서 제목')
    .requiredOption('--content <content>', '본문 (plain text 또는 JSON 문자열)')
    .option('--status <status>', '상태 값', 'draft')
    .option('--slug <slug>', '슬러그')
    .option('--excerpt <excerpt>', '요약문')
    .option('--data <json>', '추가/덮어쓰기 JSON 객체')
    .option('--lang <locale>', 'Payload locale 파라미터')
    .action(async (collection, options) => {
      try {
        const authResult = await resolveAuth({
          domain: options.domain,
          email: options.email,
          password: options.password,
        })

        const data = {
          title: options.title,
          content: maybeParseContent(options.content),
          status: options.status,
        }

        if (options.slug) data.slug = options.slug
        if (options.excerpt) data.excerpt = options.excerpt
        if (options.data) Object.assign(data, parseJsonObject(options.data, '--data'))

        const created = await createDocument({
          domain: authResult.domain,
          token: authResult.token,
          collection,
          data,
          lang: options.lang,
        })

        const doc = created?.doc || created
        console.log(`생성 성공: ${collection}`)
        console.log(`id: ${doc?.id}`)
        if (doc?.slug) console.log(`slug: ${doc.slug}`)
      } catch (error) {
        printError(error)
        process.exitCode = 1
      }
    }),
)

withAuthOptions(
  program
    .command('list')
    .description('컬렉션 문서 목록을 조회합니다.')
    .argument('<collection>', '컬렉션 slug')
    .option('--page <number>', '페이지', (value) => Number(value), 1)
    .option('--limit <number>', '페이지당 개수', (value) => Number(value), 10)
    .option('--lang <locale>', 'Payload locale 파라미터')
    .action(async (collection, options) => {
      try {
        const authResult = await resolveAuth({
          domain: options.domain,
          email: options.email,
          password: options.password,
        })

        const result = await listDocuments({
          domain: authResult.domain,
          token: authResult.token,
          collection,
          page: options.page,
          limit: options.limit,
          lang: options.lang,
        })

        const docs = result?.docs || []
        console.log(`collection: ${collection}`)
        console.log(`page: ${result?.page ?? options.page}`)
        console.log(`limit: ${result?.limit ?? options.limit}`)
        console.log(`totalDocs: ${result?.totalDocs ?? docs.length}`)
        console.log(JSON.stringify(docs, null, 2))
      } catch (error) {
        printError(error)
        process.exitCode = 1
      }
    }),
)

withAuthOptions(
  program
    .command('schema')
    .description('컬렉션 스키마를 조회합니다.')
    .argument('<collection>', '컬렉션 slug')
    .action(async (collection, options) => {
      try {
        const authResult = await resolveAuth({
          domain: options.domain,
          email: options.email,
          password: options.password,
        })

        const schema = await getCollectionSchema({
          domain: authResult.domain,
          token: authResult.token,
          collection,
        })

        console.log(`collection: ${collection}`)
        console.log(`source: ${schema.source}`)
        if (schema.typeName) console.log(`type: ${schema.typeName}`)
        console.log(JSON.stringify(schema.fields, null, 2))
      } catch (error) {
        printError(error)
        process.exitCode = 1
      }
    }),
)

withAuthOptions(
  program
    .command('publish')
    .description('문서를 퍼블리시 상태로 변경합니다.')
    .argument('<collection>', '컬렉션 slug')
    .argument('<id>', '문서 id')
    .option('--status-field <name>', '상태 필드명', 'status')
    .option('--published-value <value>', '퍼블리시 상태 값', 'published')
    .option('--lang <locale>', 'Payload locale 파라미터')
    .action(async (collection, id, options) => {
      try {
        const authResult = await resolveAuth({
          domain: options.domain,
          email: options.email,
          password: options.password,
        })

        const updated = await updateDocument({
          domain: authResult.domain,
          token: authResult.token,
          collection,
          id,
          data: {
            [options.statusField]: options.publishedValue,
          },
          lang: options.lang,
        })

        const doc = updated?.doc || updated
        console.log(`퍼블리시 성공: ${collection}`)
        console.log(`id: ${doc?.id || id}`)
        console.log(`${options.statusField}: ${options.publishedValue}`)
      } catch (error) {
        printError(error)
        process.exitCode = 1
      }
    }),
)

withAuthOptions(
  program
    .command('unpublish')
    .description('문서를 비공개 상태로 변경합니다.')
    .argument('<collection>', '컬렉션 slug')
    .argument('<id>', '문서 id')
    .option('--status-field <name>', '상태 필드명', 'status')
    .option('--draft-value <value>', '비공개 상태 값', 'draft')
    .option('--lang <locale>', 'Payload locale 파라미터')
    .action(async (collection, id, options) => {
      try {
        const authResult = await resolveAuth({
          domain: options.domain,
          email: options.email,
          password: options.password,
        })

        const updated = await updateDocument({
          domain: authResult.domain,
          token: authResult.token,
          collection,
          id,
          data: {
            [options.statusField]: options.draftValue,
          },
          lang: options.lang,
        })

        const doc = updated?.doc || updated
        console.log(`언퍼블리시 성공: ${collection}`)
        console.log(`id: ${doc?.id || id}`)
        console.log(`${options.statusField}: ${options.draftValue}`)
      } catch (error) {
        printError(error)
        process.exitCode = 1
      }
    }),
)

program.parseAsync(process.argv)
