import axios from 'axios'
import fs from 'node:fs'
import FormData from 'form-data'

function buildApiPath(domain, path) {
  const sanitized = path.startsWith('/') ? path : `/${path}`
  return `${domain}${sanitized}`
}

export async function loginWithPassword({ domain, email, password }) {
  const url = buildApiPath(domain, '/api/users/login')

  const response = await axios.post(
    url,
    { email, password },
    { headers: { 'Content-Type': 'application/json' } },
  )

  return response.data
}

export async function uploadMedia({ domain, token, filePath, alt }) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`파일이 존재하지 않습니다: ${filePath}`)
  }

  const form = new FormData()
  form.append('alt', alt)
  form.append('file', fs.createReadStream(filePath))

  const response = await axios.post(buildApiPath(domain, '/api/media'), form, {
    headers: {
      ...form.getHeaders(),
      Authorization: `JWT ${token}`,
    },
    maxBodyLength: Infinity,
  })

  return response.data
}

export async function createDocument({ domain, token, collection, data }) {
  const response = await axios.post(buildApiPath(domain, `/api/${collection}`), data, {
    headers: {
      Authorization: `JWT ${token}`,
      'Content-Type': 'application/json',
    },
  })

  return response.data
}
