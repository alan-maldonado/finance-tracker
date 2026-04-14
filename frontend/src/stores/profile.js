import { defineStore } from 'pinia'
import { ref } from 'vue'
import { profilesApi } from '../api/index.js'

export const useProfileStore = defineStore('profile', () => {
  const profiles = ref([])
  const activeProfileId = ref(parseInt(localStorage.getItem('activeProfileId')) || null)

  async function fetchProfiles() {
    profiles.value = await profilesApi.list()
    // If no active profile or it no longer exists, default to the first
    if (!activeProfileId.value || !profiles.value.find(p => p.id === activeProfileId.value)) {
      setActive(profiles.value[0]?.id ?? null)
    }
  }

  function setActive(id) {
    activeProfileId.value = id
    if (id) localStorage.setItem('activeProfileId', id)
    else localStorage.removeItem('activeProfileId')
  }

  async function createProfile(name) {
    const p = await profilesApi.create(name)
    profiles.value.push(p)
    return p
  }

  async function renameProfile(id, name) {
    const p = await profilesApi.rename(id, name)
    const idx = profiles.value.findIndex(x => x.id === id)
    if (idx !== -1) profiles.value[idx] = p
    return p
  }

  async function deleteProfile(id) {
    await profilesApi.remove(id)
    profiles.value = profiles.value.filter(p => p.id !== id)
    if (activeProfileId.value === id) setActive(profiles.value[0]?.id ?? null)
  }

  const activeProfile = () => profiles.value.find(p => p.id === activeProfileId.value)

  return { profiles, activeProfileId, activeProfile, fetchProfiles, setActive, createProfile, renameProfile, deleteProfile }
})
