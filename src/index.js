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
import { createDocument, loginWithPassword, uploadMedia } from './lib/payload.js'

function printError(error) {
  const status = error?.response?.status
  const payloadMessage = error?.response?.data?.errors?.[0]?.message || error?.response?.data?.message
  if (status) {
    console.error(`요청 실패 (${status}): ${payloadMessage || error.message}`)
    return
  }

  console.error(`요청 실패: ${error?.message || String(error)}`)
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
    throw new Error('도메인/이메일/비밀번호 정보가 부족합니다. 먼저 auth login을 실행해주세요.')
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

const program = new Command()

program
  .name('payload-cli')
  .description('Payload CMS 인증/업로드/포스트 작성 CLI')
  .version('0.1.0')

program
  .command('auth:login')
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
  })

program
  .command('auth:status')
  .description('저장된 기본 도메인과 계정 정보를 확인합니다.')
  .action(() => {
    const profile = getProfile()
    if (!profile) {
      console.log('저장된 인증 정보가 없습니다. payload-cli auth:login을 먼저 실행하세요.')
      return
    }

    console.log(`기본 도메인: ${profile.domain}`)
    console.log(`이메일: ${profile.email}`)
    console.log(`저장 경로: ${getConfigFilePath()}`)
  })

program
  .command('media:upload')
  .description('파일을 Payload media 컬렉션으로 업로드합니다.')
  .requiredOption('-f, --file <path>', '업로드할 파일 경로')
  .requiredOption('--alt <text>', 'alt 텍스트 (media 컬렉션 필수 값)')
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

      if (!auth.token) {
        throw new Error('로그인 토큰을 받지 못했습니다.')
      }

      const uploaded = await uploadMedia({
        domain: auth.domain,
        token: auth.token,
        filePath: options.file,
        alt: options.alt,
      })

      const doc = uploaded?.doc || uploaded
      console.log('업로드 성공')
      console.log(`media id: ${doc?.id}`)
      console.log(`filename: ${doc?.filename || ''}`)
      console.log(`url: ${doc?.url || ''}`)
    } catch (error) {
      printError(error)
      process.exitCode = 1
    }
  })

program
  .command('post:create')
  .description('Payload 컬렉션에 포스트 문서를 생성합니다. (기본 컬렉션: posts)')
  .requiredOption('-t, --title <title>', '포스트 제목')
  .requiredOption('-c, --content <content>', '본문(plain text 또는 richText JSON 문자열)')
  .option('--status <status>', '상태 값', 'draft')
  .option('--slug <slug>', '슬러그')
  .option('--excerpt <excerpt>', '요약문')
  .option('--collection <slug>', '대상 컬렉션 slug', 'posts')
  .option('--media-id <id>', '대표 미디어 id')
  .option('--media-field <field>', '대표 미디어 필드명', 'featuredImage')
  .option('--data <json>', '추가/덮어쓰기 데이터 JSON 객체')
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

      if (!auth.token) {
        throw new Error('로그인 토큰을 받지 못했습니다.')
      }

      let content = options.content
      if (typeof content === 'string' && content.trim().startsWith('{')) {
        try {
          content = JSON.parse(content)
        } catch {
          // plain text 처리
        }
      }

      const data = {
        title: options.title,
        content,
        status: options.status,
      }

      if (options.slug) data.slug = options.slug
      if (options.excerpt) data.excerpt = options.excerpt
      if (options.mediaId) data[options.mediaField] = Number.isNaN(Number(options.mediaId))
        ? options.mediaId
        : Number(options.mediaId)

      if (options.data) {
        Object.assign(data, parseJsonObject(options.data, '--data'))
      }

      const created = await createDocument({
        domain: auth.domain,
        token: auth.token,
        collection: options.collection,
        data,
      })

      const doc = created?.doc || created
      console.log('포스트 생성 성공')
      console.log(`collection: ${options.collection}`)
      console.log(`id: ${doc?.id}`)
      if (doc?.slug) console.log(`slug: ${doc.slug}`)
    } catch (error) {
      printError(error)
      process.exitCode = 1
    }
  })

program.parseAsync(process.argv)
