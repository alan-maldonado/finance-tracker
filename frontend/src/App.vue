<script setup>
import { ref, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import AppLogo from './components/AppLogo.vue'
import ProfileDropdown from './components/ProfileDropdown.vue'
import { useProfileStore } from './stores/profile.js'
import { useCardsStore } from './stores/cards.js'
import { statementsApi } from './api/index.js'

const route = useRoute()
const profileStore = useProfileStore()
const cardsStore = useCardsStore()
const hasCards = ref(false)
const hasStatements = ref(false)

async function checkStatements() {
  const stmts = await statementsApi.list({ profile_id: profileStore.activeProfileId })
  hasStatements.value = stmts.length > 0
}

// Derive hasCards directly from the store — updates instantly when a card is added/deleted
watch(() => cardsStore.cards.length, (len) => {
  hasCards.value = len > 0
  if (len > 0) checkStatements()
  else hasStatements.value = false
})

watch(() => profileStore.activeProfileId, checkStatements)
watch(() => route.path, checkStatements)

onMounted(async () => {
  await profileStore.fetchProfiles()
  hasCards.value = cardsStore.cards.length > 0
  if (hasCards.value) await checkStatements()
})
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-100">
    <nav class="bg-slate-900 border-b border-slate-800 px-6 py-3 flex items-center">
      <RouterLink to="/" class="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
        <AppLogo class="w-9 h-7" />
        <span class="text-lg font-semibold text-white">Finance Tracker</span>
      </RouterLink>
      <div class="flex gap-4 ml-6">
        <RouterLink
          v-if="hasCards"
          to="/"
          class="text-sm text-slate-400 hover:text-white transition-colors"
          active-class="!text-white font-medium"
        >
          Dashboard
        </RouterLink>
        <template v-if="hasStatements">
          <RouterLink
            to="/msi"
            class="text-sm text-slate-400 hover:text-white transition-colors"
            active-class="!text-white font-medium"
          >
            Installment Plans
          </RouterLink>
          <RouterLink
            to="/upcoming"
            class="text-sm text-slate-400 hover:text-white transition-colors"
            active-class="!text-white font-medium"
          >
            Upcoming Payments
          </RouterLink>
        </template>
      </div>
      <div class="ml-auto flex items-center gap-3">
        <ProfileDropdown />
        <RouterLink
          to="/settings"
          class="text-slate-400 hover:text-white transition-colors"
          active-class="!text-white"
          title="Settings"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </RouterLink>
      </div>
    </nav>
    <main class="max-w-7xl mx-auto px-4 py-6">
      <RouterView />
    </main>
  </div>
</template>
