import { defineStore } from 'pinia'
import { ref } from 'vue'
import { dashboardApi } from '../api/index.js'

export const useDashboardStore = defineStore('dashboard', () => {
  const data = ref(null)
  const loading = ref(false)
  const error = ref(null)

  async function fetchDashboard(year, month, profile_id) {
    loading.value = true
    error.value = null
    try {
      data.value = await dashboardApi.get(year, month, profile_id)
    } catch (e) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  return { data, loading, error, fetchDashboard }
})
