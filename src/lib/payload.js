import axios from 'axios'

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
  const query = `query($name: String!) { __type(name: $name) { name fields { name type { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name } } } } } } } }`
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

function getNamedType(typeRef) {
  let current = typeRef
  while (current?.ofType) current = current.ofType
  return current || null
}

function shouldExpandNestedType({ rootTypeName, namedType, depth }) {
  if (!namedType?.name) return false
  if (depth >= 4) return false
  if (namedType.kind !== 'OBJECT') return false
  return namedType.name.startsWith(`${rootTypeName}_`)
}

async function expandFields({
  domain,
  token,
  rootTypeName,
  fields,
  depth,
  typeCache,
  stack,
}) {
  const expanded = []

  for (const field of fields || []) {
    const namedType = getNamedType(field.type)
    const next = {
      ...field,
      namedType,
    }

    if (shouldExpandNestedType({ rootTypeName, namedType, depth }) && !stack.has(namedType.name)) {
      let nestedType = typeCache.get(namedType.name)
      if (!nestedType) {
        nestedType = await introspectType({
          domain,
          token,
          typeName: namedType.name,
        })
        typeCache.set(namedType.name, nestedType)
      }

      if (nestedType?.fields?.length) {
        const nextStack = new Set(stack)
        nextStack.add(namedType.name)
        next.children = await expandFields({
          domain,
          token,
          rootTypeName,
          fields: nestedType.fields,
          depth: depth + 1,
          typeCache,
          stack: nextStack,
        })
      }
    }

    expanded.push(next)
  }

  return expanded
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
  const typeCache = new Map()

  for (const typeName of candidates) {
    const type = await introspectType({ domain, token, typeName })
    typeCache.set(typeName, type)
    if (type?.fields?.length) {
      return {
        source: 'graphql-introspection',
        typeName,
        fields: await expandFields({
          domain,
          token,
          rootTypeName: typeName,
          fields: type.fields,
          depth: 0,
          typeCache,
          stack: new Set([typeName]),
        }),
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
          children:
            sample[key] && typeof sample[key] === 'object' && !Array.isArray(sample[key])
              ? Object.keys(sample[key]).map((nestedKey) => ({
                  name: nestedKey,
                  type: { kind: 'UNKNOWN', name: typeof sample[key][nestedKey] },
                }))
              : undefined,
        }))
      : [],
  }
}

function parseCollectionsFromGraphQLSchema(data) {
  const fields = data?.data?.__schema?.queryType?.fields || []

  return fields
    .map((field) => field.name)
    .filter((name) => /^[a-z0-9_]+$/i.test(name) && name !== 'version')
}

async function fetchCollectionsFromAccessEndpoint({ domain, token }) {
  const response = await axios.get(buildPath(domain, '/api/access'), {
    headers: {
      ...authHeaders(token),
    },
  })

  const collectionsObj = response.data?.collections
  if (!collectionsObj || typeof collectionsObj !== 'object') {
    return []
  }

  return Object.keys(collectionsObj)
}

export async function listCollections({ domain, token }) {
  const discovered = new Set()

  try {
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

    parseCollectionsFromGraphQLSchema(response.data).forEach((name) => discovered.add(name))
  } catch {
    // GraphQL이 비활성화된 환경을 위해 REST fallback을 사용한다.
  }

  try {
    const fromAccess = await fetchCollectionsFromAccessEndpoint({ domain, token })
    fromAccess.forEach((name) => discovered.add(name))
  } catch {
    // access endpoint가 닫혀 있어도 GraphQL 결과가 있으면 그대로 진행한다.
  }

  return [...discovered].sort()
}
