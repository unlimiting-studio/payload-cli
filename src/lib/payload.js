import axios from 'axios'
import fs from 'node:fs'
import FormData from 'form-data'

function buildPath(domain, path, query = {}) {
  const sanitized = path.startsWith('/') ? path : `/${path}`
  const url = new URL(`${domain}${sanitized}`)

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    url.searchParams.set(key, String(value))
  })

  return url.toString()
}

function authHeaders(token) {
  return token ? { Authorization: `JWT ${token}` } : {}
}

export async function loginWithPassword({ domain, email, password }) {
  const response = await axios.post(
    buildPath(domain, '/api/users/login'),
    { email, password },
    { headers: { 'Content-Type': 'application/json' } },
  )

  return response.data
}

export async function uploadMedia({ domain, token, filePath, alt, lang }) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`파일이 존재하지 않습니다: ${filePath}`)
  }

  const form = new FormData()
  form.append('alt', alt)
  form.append('file', fs.createReadStream(filePath))

  const response = await axios.post(buildPath(domain, '/api/media', { locale: lang }), form, {
    headers: {
      ...form.getHeaders(),
      ...authHeaders(token),
    },
    maxBodyLength: Infinity,
  })

  return response.data
}

export async function createDocument({ domain, token, collection, data, lang }) {
  const response = await axios.post(buildPath(domain, `/api/${collection}`, { locale: lang }), data, {
    headers: {
      ...authHeaders(token),
      'Content-Type': 'application/json',
    },
  })

  return response.data
}

export async function listDocuments({ domain, token, collection, page, limit, lang }) {
  const response = await axios.get(
    buildPath(domain, `/api/${collection}`, { page, limit, locale: lang }),
    {
      headers: {
        ...authHeaders(token),
      },
    },
  )

  return response.data
}

export async function updateDocument({ domain, token, collection, id, data, lang }) {
  const response = await axios.patch(buildPath(domain, `/api/${collection}/${id}`, { locale: lang }), data, {
    headers: {
      ...authHeaders(token),
      'Content-Type': 'application/json',
    },
  })

  return response.data
}

async function introspectType({ domain, token, typeName }) {
  const query = `query($name: String!) { __type(name: $name) { name fields { name type { kind name ofType { kind name ofType { kind name } } } } } }`
  const response = await axios.post(
    buildPath(domain, '/api/graphql'),
    { query, variables: { name: typeName } },
    {
      headers: {
        ...authHeaders(token),
        'Content-Type': 'application/json',
      },
    },
  )

  return response.data?.data?.__type || null
}

function toPascalCase(value) {
  return value
    .split(/[^a-zA-Z0-9]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

export async function getCollectionSchema({ domain, token, collection }) {
  const singular = collection.endsWith('s') ? collection.slice(0, -1) : collection
  const candidates = [toPascalCase(singular), toPascalCase(collection)]

  for (const typeName of candidates) {
    const type = await introspectType({ domain, token, typeName })
    if (type?.fields?.length) {
      return {
        source: 'graphql-introspection',
        typeName,
        fields: type.fields,
      }
    }
  }

  const listing = await listDocuments({
    domain,
    token,
    collection,
    page: 1,
    limit: 1,
  })
  const sample = listing?.docs?.[0] || null

  return {
    source: 'sample-doc-fallback',
    typeName: null,
    fields: sample
      ? Object.keys(sample).map((key) => ({
          name: key,
          type: { kind: 'UNKNOWN', name: typeof sample[key] },
        }))
      : [],
  }
}

export async function listCollections({ domain, token }) {
  const query = `query { __schema { queryType { fields { name type { kind name ofType { kind name ofType { kind name } } } } } } }`
  const response = await axios.post(
    buildPath(domain, '/api/graphql'),
    { query },
    {
      headers: {
        ...authHeaders(token),
        'Content-Type': 'application/json',
      },
    },
  )

  const fields = response.data?.data?.__schema?.queryType?.fields || []
  const candidates = fields
    .map((field) => field.name)
    .filter((name) => /^[a-z0-9_]+$/i.test(name) && name !== 'version')

  return [...new Set(candidates)].sort()
}
