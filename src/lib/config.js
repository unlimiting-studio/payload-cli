import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const CONFIG_DIR = path.join(os.homedir(), '.config', 'payload')
const CONFIG_FILE = path.join(CONFIG_DIR, 'credentials.json')

function ensureConfigDir() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 })
}

export function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    if (!parsed.profiles || typeof parsed.profiles !== 'object') {
      return { profiles: {}, defaultDomain: '' }
    }
    return parsed
  } catch {
    return { profiles: {}, defaultDomain: '' }
  }
}

export function saveConfig(config) {
  ensureConfigDir()
  fs.writeFileSync(CONFIG_FILE, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
  fs.chmodSync(CONFIG_FILE, 0o600)
}

export function normalizeDomain(value) {
  if (!value) return ''

  let domain = value.trim()
  if (!domain.startsWith('http://') && !domain.startsWith('https://')) {
    domain = `https://${domain}`
  }

  return domain.replace(/\/+$/, '')
}

export function getProfile(domain) {
  const config = loadConfig()
  const normalized = normalizeDomain(domain) || config.defaultDomain
  if (!normalized) return null

  const profile = config.profiles[normalized]
  if (!profile) return null

  return {
    domain: normalized,
    email: profile.email,
    password: profile.password,
  }
}

export function upsertProfile({ domain, email, password, setDefault = true }) {
  const config = loadConfig()
  const normalized = normalizeDomain(domain)

  config.profiles[normalized] = { email, password }
  if (setDefault) config.defaultDomain = normalized

  saveConfig(config)

  return {
    domain: normalized,
    email,
  }
}

export function getDefaultDomain() {
  const config = loadConfig()
  return config.defaultDomain || ''
}

export function getConfigFilePath() {
  return CONFIG_FILE
}
