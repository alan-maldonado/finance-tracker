<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useDashboardStore } from '../stores/dashboard.js'
import { useCardsStore } from '../stores/cards.js'
import { useProfileStore } from '../stores/profile.js'
import CardSummaryWidget from '../components/CardSummaryWidget.vue'
import AddCardModal from '../components/AddCardModal.vue'

const router = useRouter()
const dashStore = useDashboardStore()
const cardsStore = useCardsStore()
const profileStore = useProfileStore()

const now = new Date()
const selectedYear = ref(now.getFullYear())
const selectedMonth = ref(now.getMonth() + 1)
const showAddCard = ref(false)

const MONTHS = ['January','February','March','April','May','June',
                 'July','August','September','October','November','December']

const monthLabel = computed(() => `${MONTHS[selectedMonth.value - 1]} ${selectedYear.value}`)

function prevMonth() {
  if (selectedMonth.value === 1) {
    selectedMonth.value = 12
    selectedYear.value--
  } else {
    selectedMonth.value--
  }
}

function nextMonth() {
  if (selectedMonth.value === 12) {
    selectedMonth.value = 1
    selectedYear.value++
  } else {
    selectedMonth.value++
  }
}

const fmt = (n) =>
  n == null ? '—' : new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n)

const grandTotal = computed(() => {
  if (!dashStore.data) return null
  // Sum no-interest-remaining for cards that have it; fall back to projectedBalance for the rest
  return dashStore.data.cards.reduce((sum, c) => {
    const val = c.summary.noInterestRemaining ?? c.summary.projectedBalance ?? 0
    return sum + val
  }, 0)
})

watch([selectedYear, selectedMonth, () => profileStore.activeProfileId], () => {
  cardsStore.fetchCards(profileStore.activeProfileId)
  dashStore.fetchDashboard(selectedYear.value, selectedMonth.value, profileStore.activeProfileId)
})

async function onCardSaved() {
  showAddCard.value = false
  await cardsStore.fetchCards(profileStore.activeProfileId)
  dashStore.fetchDashboard(selectedYear.value, selectedMonth.value, profileStore.activeProfileId)
}

onMounted(async () => {
  await cardsStore.fetchCards(profileStore.activeProfileId)
  dashStore.fetchDashboard(selectedYear.value, selectedMonth.value, profileStore.activeProfileId)
})
</script>

<template>
  <div>

    <!-- Initial load -->
    <div v-if="dashStore.data === null" class="flex items-center justify-center py-32">
      <div class="w-6 h-6 border-2 border-slate-600 border-t-indigo-500 rounded-full animate-spin"></div>
    </div>

    <!-- Landing: no cards yet -->
    <div
      v-else-if="!dashStore.loading && dashStore.data.cards.length === 0"
      class="flex flex-col items-center justify-center py-24 text-center"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 32" fill="none" class="w-20 h-16 mx-auto mb-6 opacity-80">
        <rect x="6" y="5" width="32" height="20" rx="3" fill="#4f46e5" opacity="0.5"/>
        <rect x="2" y="7" width="32" height="20" rx="3" fill="#6366f1"/>
        <rect x="2" y="12" width="32" height="5" fill="#4338ca"/>
        <rect x="6" y="19" width="7" height="5" rx="1" fill="#a5b4fc" opacity="0.8"/>
        <polyline points="22,22 26,18 29,20 33,15" stroke="#e0e7ff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>
        <circle cx="33" cy="15" r="1.5" fill="#e0e7ff" opacity="0.9"/>
      </svg>
      <h1 class="text-3xl font-bold text-white mb-3">Welcome to Finance Tracker</h1>
      <p class="text-slate-400 max-w-sm mx-auto mb-8">
        Track your credit cards, installment plans, and upcoming payments — all in one place.
      </p>
      <button
        @click="showAddCard = true"
        class="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl transition-colors"
      >
        + Add your first card
      </button>
    </div>

    <!-- Dashboard: has cards -->
    <template v-else-if="dashStore.data.cards.length > 0">
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold text-white">Dashboard</h1>
          <p class="text-slate-400 text-sm mt-0.5">Monthly overview of your credit cards</p>
        </div>
      </div>

      <!-- Month selector -->
      <div class="flex items-center gap-4 mb-6">
        <button
          @click="prevMonth"
          class="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
        >
          ←
        </button>
        <span class="text-white font-semibold text-lg w-48 text-center">{{ monthLabel }}</span>
        <button
          @click="nextMonth"
          class="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
        >
          →
        </button>
        <div v-if="grandTotal !== null" class="ml-auto text-right">
          <div class="text-slate-400 text-xs">Total to pay (no interest)</div>
          <div class="text-2xl font-bold" :class="grandTotal > 0 ? 'text-white' : 'text-green-400'">
            {{ fmt(grandTotal) }}
          </div>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="dashStore.loading" class="text-slate-400 text-center py-12">
        Loading...
      </div>

      <!-- Card grid -->
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <CardSummaryWidget
          v-for="cardData in dashStore.data.cards"
          :key="cardData.card.id"
          :card-data="cardData"
        />
      </div>
    </template>

    <!-- Add Card Modal -->
    <AddCardModal
      v-if="showAddCard"
      @close="showAddCard = false"
      @saved="onCardSaved"
    />
  </div>
</template>
