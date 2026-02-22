#!/usr/bin/env node
import { Command } from 'commander'
import process from 'node:process'
import readline from 'node:readline/promises'

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

async function promptForMissing({ domain, email, password }) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    const nextDomain = domain || (await rl.question('Payload 도메인 (예: https://blog.whiskeycat.team): '))
    const nextEmail = email || (await rl.question('이메일: '))
    const nextPassword = password || (await rl.question('비밀번호: '))

    return {
      domain: normalizeDomain(nextDomain),
      email: nextEmail.trim(),
      password: nextPassword,
    }
  } finally {
    rl.close()
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

async function runDynamicCollectionCommand(rawCommand, commandOptions) {
  const [collection, action] = rawCommand.split(':')
  if (!collection || !action) {
    throw new Error(`알 수 없는 명령입니다: ${rawCommand}`)
  }

  const auth = await resolveAuth({
    domain: commandOptions.domain,
    email: commandOptions.email,
    password: commandOptions.password,
  })

  if (!auth.token) {
    throw new Error('로그인 토큰을 받지 못했습니다.')
  }

  if (action === 'create') {
    if (!commandOptions.title || !commandOptions.content) {
      throw new Error(`${collection}:create는 --title, --content가 필요합니다.`)
    }

    const data = {
      title: commandOptions.title,
      content: maybeParseContent(commandOptions.content),
      status: commandOptions.status || 'draft',
    }

    if (commandOptions.slug) data.slug = commandOptions.slug
    if (commandOptions.excerpt) data.excerpt = commandOptions.excerpt
    if (commandOptions.data) Object.assign(data, parseJsonObject(commandOptions.data, '--data'))

    const created = await createDocument({
      domain: auth.domain,
      token: auth.token,
      collection,
      data,
      lang: commandOptions.lang,
    })

    const doc = created?.doc || created
    console.log(`생성 성공: ${collection}`)
    console.log(`id: ${doc?.id}`)
    if (doc?.slug) console.log(`slug: ${doc.slug}`)
    return
  }

  if (action === 'list') {
    const result = await listDocuments({
      domain: auth.domain,
      token: auth.token,
      collection,
      page: commandOptions.page || 1,
      limit: commandOptions.limit || 10,
      lang: commandOptions.lang,
    })

    const docs = result?.docs || []
    console.log(`collection: ${collection}`)
    console.log(`page: ${result?.page ?? commandOptions.page ?? 1}`)
    console.log(`limit: ${result?.limit ?? commandOptions.limit ?? 10}`)
    console.log(`totalDocs: ${result?.totalDocs ?? docs.length}`)
    console.log(JSON.stringify(docs, null, 2))
    return
  }

  if (action === 'schema') {
    const schema = await getCollectionSchema({
      domain: auth.domain,
      token: auth.token,
      collection,
    })

    console.log(`collection: ${collection}`)
    console.log(`source: ${schema.source}`)
    if (schema.typeName) console.log(`type: ${schema.typeName}`)
    console.log(JSON.stringify(schema.fields, null, 2))
    return
  }

  if (action === 'publish' || action === 'unpublish') {
    const id = commandOptions.id || commandOptions.positionalId
    if (!id) {
      throw new Error(`${collection}:${action}는 id가 필요합니다. 예: payload ${collection}:${action} 1`)
    }

    const statusField = commandOptions.statusField || 'status'
    const statusValue = action === 'publish' ? commandOptions.publishedValue || 'published' : commandOptions.draftValue || 'draft'

    const updated = await updateDocument({
      domain: auth.domain,
      token: auth.token,
      collection,
      id,
      data: {
        [statusField]: statusValue,
      },
      lang: commandOptions.lang,
    })

    const doc = updated?.doc || updated
    console.log(`${action === 'publish' ? '퍼블리시' : '언퍼블리시'} 성공: ${collection}`)
    console.log(`id: ${doc?.id || id}`)
    console.log(`${statusField}: ${statusValue}`)
    return
  }

  throw new Error(`지원하지 않는 동적 명령입니다: ${rawCommand}`)
}

const program = new Command()

program
  .name('payload')
  .description('Payload CMS 인증/컬렉션 조작 CLI')
  .version('0.2.0')

program
  .command('auth')
  .description('인증 관련 명령')
  .addCommand(
    new Command('login')
      .description('도메인/계정으로 인증하고 로컬에 자격증명을 저장합니다.')
      .option('-d, --domain <domain>', 'Payload 도메인 (예: https://example.com)')
      .option('-e, --email <email>', '로그인 이메일')
      .option('-p, --password <password>', '로그인 비밀번호')
      .action(async (options) => {
        try {
          const auth = await resolveAuth({
            domain: options.domain,
            email: options.email,
            password: options.password,
          })

          console.log(`인증 성공: ${auth.user?.email || auth.email}`)
          console.log(`기본 도메인: ${auth.domain}`)
          console.log(`저장 경로: ${getConfigFilePath()}`)
        } catch (error) {
          printError(error)
          process.exitCode = 1
        }
      }),
  )
  .addCommand(
    new Command('status').description('저장된 기본 도메인과 계정 정보를 확인합니다.').action(() => {
      const profile = getProfile()
      if (!profile) {
        console.log('저장된 인증 정보가 없습니다. payload auth login을 먼저 실행하세요.')
        return
      }

      console.log(`기본 도메인: ${profile.domain}`)
      console.log(`이메일: ${profile.email}`)
      console.log(`저장 경로: ${getConfigFilePath()}`)
    }),
  )

program
  .command('collections')
  .description('컬렉션 메타 정보 명령')
  .addCommand(
    new Command('list')
      .description('사용 가능한 컬렉션(추정)을 조회합니다. (GraphQL introspection 기반)')
      .option('-d, --domain <domain>', 'Payload 도메인')
      .option('-e, --email <email>', '로그인 이메일 (저장값 우선)')
      .option('-p, --password <password>', '로그인 비밀번호 (저장값 우선)')
      .action(async (options) => {
        try {
          const auth = await resolveAuth({
            domain: options.domain,
            email: options.email,
            password: options.password,
          })

          const collections = await listCollections({
            domain: auth.domain,
            token: auth.token,
          })

          console.log(JSON.stringify(collections, null, 2))
        } catch (error) {
          printError(error)
          process.exitCode = 1
        }
      }),
  )

program
  .arguments('[dynamicCommand] [id]')
  .option('-d, --domain <domain>', 'Payload 도메인')
  .option('-e, --email <email>', '로그인 이메일 (저장값 우선)')
  .option('-p, --password <password>', '로그인 비밀번호 (저장값 우선)')
  .option('--lang <locale>', 'Payload locale 파라미터')
  .option('--title <title>', 'create: title')
  .option('--content <content>', 'create: content (plain text 또는 JSON 문자열)')
  .option('--status <status>', 'create: status 값 (기본 draft)')
  .option('--slug <slug>', 'create: slug')
  .option('--excerpt <excerpt>', 'create: excerpt')
  .option('--data <json>', 'create: 추가 JSON 객체')
  .option('--page <number>', 'list: 페이지', (value) => Number(value))
  .option('--limit <number>', 'list: 페이지당 개수', (value) => Number(value))
  .option('--id <id>', 'publish/unpublish: 문서 id')
  .option('--status-field <name>', 'publish/unpublish: 상태 필드명', 'status')
  .option('--published-value <value>', 'publish/unpublish: published 값', 'published')
  .option('--draft-value <value>', 'unpublish: draft 값', 'draft')
  .action(async (dynamicCommand, positionalId, options) => {
    try {
      if (!dynamicCommand) {
        program.help()
        return
      }

      if (!dynamicCommand.includes(':')) {
        throw new Error(`알 수 없는 명령입니다: ${dynamicCommand}`)
      }

      await runDynamicCollectionCommand(dynamicCommand, {
        ...options,
        positionalId,
      })
    } catch (error) {
      printError(error)
      process.exitCode = 1
    }
  })

program.parseAsync(process.argv)
