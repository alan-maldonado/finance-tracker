<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useDashboardStore } from '../stores/dashboard.js'
import { useCardsStore } from '../stores/cards.js'
import CardSummaryWidget from '../components/CardSummaryWidget.vue'
import AddCardModal from '../components/AddCardModal.vue'

const router = useRouter()
const dashStore = useDashboardStore()
const cardsStore = useCardsStore()

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

watch([selectedYear, selectedMonth], () => {
  dashStore.fetchDashboard(selectedYear.value, selectedMonth.value)
})

onMounted(async () => {
  await cardsStore.fetchCards()
  dashStore.fetchDashboard(selectedYear.value, selectedMonth.value)
})
</script>

<template>
  <div>
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

    <!-- No cards -->
    <div
      v-else-if="!dashStore.data || dashStore.data.cards.length === 0"
      class="text-center py-16"
    >
      <div class="text-5xl mb-4">💳</div>
      <h2 class="text-white font-semibold text-xl mb-2">No cards yet</h2>
      <p class="text-slate-400 mb-4">Add your first credit card to get started</p>
      <button
        @click="showAddCard = true"
        class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
      >
        Add card
      </button>
    </div>

    <!-- Card grid -->
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <CardSummaryWidget
        v-for="cardData in dashStore.data.cards"
        :key="cardData.card.id"
        :card-data="cardData"
      />
    </div>

    <!-- Add Card Modal -->
    <AddCardModal
      v-if="showAddCard"
      @close="showAddCard = false"
      @saved="showAddCard = false; dashStore.fetchDashboard(selectedYear, selectedMonth)"
    />
  </div>
</template>
