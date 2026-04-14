import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

export const cardsApi = {
  list: () => api.get('/cards').then(r => r.data),
  create: (data) => api.post('/cards', data).then(r => r.data),
  update: (id, data) => api.put(`/cards/${id}`, data).then(r => r.data),
  reorder: (ids) => api.put('/cards/reorder', { ids }).then(r => r.data),
  remove: (id) => api.delete(`/cards/${id}`).then(r => r.data),
}

export const statementsApi = {
  list: (params) => api.get('/statements', { params }).then(r => r.data),
  upload: (formData) => api.post('/statements/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data),
  parse: (formData) => api.post('/statements/parse', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data),
  remove: (id) => api.delete(`/statements/${id}`).then(r => r.data),
}

export const transactionsApi = {
  list: (params) => api.get('/transactions', { params }).then(r => r.data),
}

export const manualEntriesApi = {
  list: (params) => api.get('/manual-entries', { params }).then(r => r.data),
  create: (data) => api.post('/manual-entries', data).then(r => r.data),
  remove: (id) => api.delete(`/manual-entries/${id}`).then(r => r.data),
}

export const dashboardApi = {
  get: (year, month) => api.get('/dashboard', { params: { year, month } }).then(r => r.data),
}

export const msiApi = {
  get: () => api.get('/msi').then(r => r.data),
}
