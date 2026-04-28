<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useCardsStore } from '../stores/cards.js'
import { useProfileStore } from '../stores/profile.js'
import { statementsApi, transactionsApi, manualEntriesApi, trendsApi } from '../api/index.js'
import TransactionList from '../components/TransactionList.vue'
import InstallmentTracker from '../components/InstallmentTracker.vue'
import ManualEntryModal from '../components/ManualEntryModal.vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  Tooltip, Legend,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

const props = defineProps({ id: { type: String, required: true } })
const router = useRouter()
const route = useRoute()
const cardsStore = useCardsStore()
const profileStore = useProfileStore()

const card = computed(() => cardsStore.cards.find(c => c.id === props.id))

const statements = ref([])
const selectedStatementId = ref(null)
const transactions = ref([])
const manualEntries = ref([])
const showManualModal = ref(false)
const loading = ref(false)
const activeTab = ref('transactions')

const selectedStatement = computed(() =>
  statements.value.find(s => s.id === selectedStatementId.value)
)

const selectedYear = computed(() => selectedStatement.value?.period_year)
const selectedMonth = computed(() => selectedStatement.value?.period_month)

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const BANK_LABEL = {
  banamex: 'Banamex',
  santander: 'Santander',
  liverpool: 'Liverpool',
  amex: 'Amex',
  other: 'Other',
}

const fmt = (n) =>
  n == null ? '—' : new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n)

function statementLabel(s) {
  // Use payment due date month to match dashboard grouping, fall back to period month
  if (s.payment_due_date) {
    const d = new Date(s.payment_due_date + 'T00:00:00')
    return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
  }
  return `${MONTHS[s.period_month - 1]} ${s.period_year}`
}

const totalCharges = computed(() =>
  transactions.value.filter(t => t.type === 'charge').reduce((s, t) => s + t.amount, 0)
)
const totalMsi = computed(() =>
  transactions.value.filter(t => t.type === 'msi').reduce((s, t) => s + (t.msi_monthly_amount || t.amount), 0)
)
// Amex excludes future MSI capital from total_balance but deducts it from
// available credit. Sum unbilled installments so we can mirror that.
const pendingMsiCapital = computed(() =>
  transactions.value
    .filter(t => t.type === 'msi')
    .reduce((s, t) => {
      const monthly = t.msi_monthly_amount || 0
      const remaining = Math.max(0, (t.msi_total_months || 0) - (t.msi_current_month || 0))
      return s + monthly * remaining
    }, 0)
)
const available = computed(() => {
  if (!card.value || card.value.credit_limit == null || selectedStatement.value?.total_balance == null) return null
  let v = card.value.credit_limit - selectedStatement.value.total_balance
  if (card.value.bank === 'amex') v -= pendingMsiCapital.value
  return v
})
const totalPayments = computed(() =>
  Math.abs(transactions.value.filter(t => t.type === 'payment').reduce((s, t) => s + t.amount, 0))
)
const totalInterest = computed(() =>
  transactions.value.filter(t => t.type === 'interest').reduce((s, t) => s + t.amount, 0)
)
const manualBalance = computed(() =>
  manualEntries.value.reduce((s, e) => s + e.amount, 0)
)
const projectedBalance = computed(() => {
  if (!selectedStatement.value?.total_balance) return null
  return selectedStatement.value.total_balance + manualBalance.value
})

// ── History chart ──────────────────────────────────────────────────────────
const historyData = ref(null)

async function loadHistory() {
  if (!card.value) return
  historyData.value = await trendsApi.getCard(card.value.id)
}

const fmtCompact = (n) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', notation: 'compact', maximumFractionDigits: 1 }).format(n)

const balanceChartData = computed(() => {
  const h = historyData.value
  if (!h?.months?.length || h.balances.every(v => v === null)) return null
  return {
    labels: h.months,
    datasets: [{
      label: 'Balance',
      data: h.balances,
      borderColor: card.value?.color || '#6366f1',
      backgroundColor: (card.value?.color || '#6366f1') + '22',
      pointBackgroundColor: card.value?.color || '#6366f1',
      pointBorderColor: card.value?.color || '#6366f1',
      borderWidth: 2, pointRadius: 4, pointHoverRadius: 6,
      tension: 0.35, fill: false, spanGaps: false,
    }],
  }
})

const balanceChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: {
      labels: {
        color: '#94a3b8', usePointStyle: true, pointStyleWidth: 10,
        font: { size: 12 }, padding: 16,
      },
    },
    tooltip: {
      backgroundColor: '#1e293b',
      borderColor: '#334155',
      borderWidth: 1,
      titleColor: '#e2e8f0',
      bodyColor: '#94a3b8',
      padding: 10,
      callbacks: {
        label: (ctx) => ctx.raw == null ? null
          : ` ${ctx.dataset.label}: ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(ctx.raw)}`,
      },
    },
  },
  scales: {
    x: {
      grid: { color: 'rgba(148,163,184,0.08)' },
      ticks: { color: '#94a3b8', font: { size: 11 } },
      border: { color: 'rgba(148,163,184,0.15)' },
    },
    y: {
      grid: { color: 'rgba(148,163,184,0.08)' },
      ticks: { color: '#94a3b8', font: { size: 11 }, callback: (v) => fmtCompact(v) },
      border: { color: 'rgba(148,163,184,0.15)' },
    },
  },
}

const historyChartData = computed(() => {
  const h = historyData.value
  if (!h?.months?.length) return null
  const hasInterest = h.interest.some(v => v > 0)
  const hasNoInterest = h.noInterestPayment?.some(v => v != null)
  return {
    labels: h.months,
    datasets: [
      {
        label: 'Charges',
        data: h.charges,
        borderColor: 'rgba(239,68,68,0.9)',
        backgroundColor: 'rgba(239,68,68,0.15)',
        pointBackgroundColor: 'rgba(239,68,68,0.9)',
        borderWidth: 2, pointRadius: 4, pointHoverRadius: 6,
        tension: 0.35, fill: false,
      },
      {
        label: 'Monthly MSI',
        data: h.msiMonthly,
        borderColor: 'rgba(251,146,60,0.9)',
        backgroundColor: 'rgba(251,146,60,0.15)',
        pointBackgroundColor: 'rgba(251,146,60,0.9)',
        borderWidth: 2, pointRadius: 4, pointHoverRadius: 6,
        tension: 0.35, fill: false,
      },
      {
        label: 'Payments',
        data: h.payments,
        borderColor: 'rgba(74,222,128,0.9)',
        backgroundColor: 'rgba(74,222,128,0.15)',
        pointBackgroundColor: 'rgba(74,222,128,0.9)',
        borderWidth: 2, pointRadius: 4, pointHoverRadius: 6,
        tension: 0.35, fill: false,
      },
      ...(hasInterest ? [{
        label: 'Interest',
        data: h.interest,
        borderColor: 'rgba(250,204,21,0.9)',
        backgroundColor: 'rgba(250,204,21,0.15)',
        pointBackgroundColor: 'rgba(250,204,21,0.9)',
        borderWidth: 2, pointRadius: 4, pointHoverRadius: 6,
        tension: 0.35, fill: false,
      }] : []),
      ...(hasNoInterest ? [{
        label: 'No-interest payment',
        data: h.noInterestPayment,
        borderColor: 'rgba(129,140,248,0.9)',
        backgroundColor: 'rgba(129,140,248,0.15)',
        pointBackgroundColor: 'rgba(129,140,248,0.9)',
        borderWidth: 2, pointRadius: 4, pointHoverRadius: 6,
        tension: 0.35, fill: false, spanGaps: false,
      }] : []),
    ],
  }
})

const historyChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: {
      labels: {
        color: '#94a3b8', usePointStyle: true, pointStyleWidth: 10,
        font: { size: 12 }, padding: 16,
      },
    },
    tooltip: {
      backgroundColor: '#1e293b',
      borderColor: '#334155',
      borderWidth: 1,
      titleColor: '#e2e8f0',
      bodyColor: '#94a3b8',
      padding: 10,
      callbacks: {
        label: (ctx) => ctx.raw == null ? null
          : ` ${ctx.dataset.label}: ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(ctx.raw)}`,
      },
    },
  },
  scales: {
    x: {
      grid: { color: 'rgba(148,163,184,0.08)' },
      ticks: { color: '#94a3b8', font: { size: 11 } },
      border: { color: 'rgba(148,163,184,0.15)' },
    },
    y: {
      grid: { color: 'rgba(148,163,184,0.08)' },
      ticks: { color: '#94a3b8', font: { size: 11 }, callback: (v) => fmtCompact(v) },
      border: { color: 'rgba(148,163,184,0.15)' },
    },
  },
}

async function loadStatements() {
  if (!card.value) return
  statements.value = await statementsApi.list({ card_id: card.value.id })
  if (statements.value.length) {
    const fromQuery = route.query.statement
    const match = fromQuery && statements.value.find(s => String(s.id) === String(fromQuery))
    selectedStatementId.value = match ? match.id : statements.value[0].id
  }
}

async function loadTransactions() {
  if (!selectedStatementId.value) { transactions.value = []; return }
  transactions.value = await transactionsApi.list({ statement_id: selectedStatementId.value })
}

async function loadManualEntries() {
  if (!card.value || !selectedStatement.value) { manualEntries.value = []; return }
  manualEntries.value = await manualEntriesApi.list({
    card_id: card.value.id,
    year: selectedStatement.value.period_year,
    month: selectedStatement.value.period_month,
  })
}

async function deleteManualEntry(id) {
  await manualEntriesApi.remove(id)
  await loadManualEntries()
}

async function deleteStatement(id) {
  if (!confirm('Delete this statement and all its transactions?')) return
  await statementsApi.remove(id)
  await loadStatements()
  await loadTransactions()
  await loadManualEntries()
}

watch(selectedStatementId, async (id) => {
  router.replace({ query: { ...route.query, statement: id } })
  await loadTransactions()
  await loadManualEntries()
})

onMounted(async () => {
  await cardsStore.fetchCards(profileStore.activeProfileId)
  await loadStatements()
  await loadTransactions()
  await loadManualEntries()
  await loadHistory()
})
</script>

<template>
  <div v-if="!card" class="text-slate-400">Loading...</div>
  <div v-else>
    <!-- Header -->
    <div class="flex items-center gap-4 mb-6">
      <button
        @click="router.push('/')"
        class="text-slate-400 hover:text-white transition-colors text-sm"
      >
        ← Back
      </button>
      <div class="flex items-center gap-3">
        <div class="w-4 h-4 rounded-full" :style="{ backgroundColor: card.color }"></div>
        <div>
          <h1 class="text-white font-bold text-xl">{{ card.alias }}</h1>
          <p class="text-slate-500 text-sm">{{ BANK_LABEL[card.bank] || card.bank.toUpperCase() }}<template v-if="card.last4"> · •••• {{ card.last4 }}</template></p>
        </div>
      </div>
      <button
        @click="router.push(`/upload?card_id=${card.id}`)"
        class="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        Upload statement
      </button>
    </div>

    <!-- Statement selector -->
    <div class="bg-slate-800 rounded-xl border border-slate-700 p-4 mb-6">
      <div class="flex items-center justify-between gap-4 flex-wrap">
        <div class="flex items-center gap-3">
          <label class="text-slate-400 text-sm">Statement:</label>
          <select
            v-model="selectedStatementId"
            class="bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-1.5 text-sm"
          >
            <option v-if="!statements.length" :value="null">No statements</option>
            <option v-for="s in statements" :key="s.id" :value="s.id">
              {{ statementLabel(s) }}
            </option>
          </select>
        </div>

        <div v-if="selectedStatement" class="flex gap-4 text-sm">
          <div class="text-right">
            <div class="text-slate-500 text-xs">Total balance</div>
            <div class="text-red-400 font-semibold">{{ fmt(selectedStatement.total_balance) }}</div>
          </div>
          <div class="text-right">
            <div class="text-slate-500 text-xs">Min. payment</div>
            <div class="text-white font-semibold">{{ fmt(selectedStatement.minimum_payment) }}</div>
          </div>
          <div v-if="selectedStatement.no_interest_payment" class="text-right">
            <div class="text-slate-500 text-xs">No-interest payment</div>
            <div class="text-blue-400 font-semibold">{{ fmt(selectedStatement.no_interest_payment) }}</div>
          </div>
          <div class="text-right">
            <div class="text-slate-500 text-xs">Due date</div>
            <div v-if="selectedStatement.minimum_payment === 0" class="text-green-400 font-semibold">No payment due</div>
            <div v-else class="text-white font-semibold">
              {{ selectedStatement.payment_due_date
                  ? new Date(selectedStatement.payment_due_date + 'T00:00:00').toLocaleDateString('en-US')
                  : '—' }}
            </div>
          </div>
          <div v-if="available != null" class="text-right">
            <div class="text-slate-500 text-xs">Available</div>
            <div
              class="font-semibold"
              :class="available < 0 ? 'text-red-400' : 'text-green-400'"
            >
              {{ fmt(available) }}
            </div>
          </div>
          <a
            v-if="selectedStatement.pdf_filename"
            :href="`/uploads/${selectedStatement.pdf_filename}`"
            :download="selectedStatement.pdf_filename.split('/').pop()"
            class="text-slate-600 hover:text-indigo-400 transition-colors self-end"
            title="Download PDF"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </a>
          <button
            @click="deleteStatement(selectedStatement.id)"
            class="text-slate-600 hover:text-red-400 transition-colors text-xs self-end"
          >
            Delete
          </button>
        </div>
      </div>

      <!-- Balance projection -->
      <div v-if="projectedBalance !== null" class="mt-4 pt-4 border-t border-slate-700 flex gap-6 text-sm">
        <div>
          <span class="text-slate-500 text-xs">One-time charges</span>
          <div class="text-red-400 font-medium">{{ fmt(totalCharges) }}</div>
        </div>
        <div>
          <span class="text-slate-500 text-xs">Monthly MSI</span>
          <div class="text-orange-400 font-medium">{{ fmt(totalMsi) }}</div>
        </div>
        <div>
          <span class="text-slate-500 text-xs">Payments</span>
          <div class="text-green-400 font-medium">{{ fmt(totalPayments) }}</div>
        </div>
        <div v-if="totalInterest > 0">
          <span class="text-slate-500 text-xs">Interest / IVA</span>
          <div class="text-yellow-400 font-medium">{{ fmt(totalInterest) }}</div>
        </div>
        <div v-if="manualBalance !== 0" class="border-l border-slate-700 pl-6">
          <span class="text-slate-500 text-xs">Manual adjustments</span>
          <div :class="manualBalance < 0 ? 'text-green-400' : 'text-orange-400'" class="font-medium">
            {{ manualBalance > 0 ? '+' : '' }}{{ fmt(manualBalance) }}
          </div>
        </div>
        <div class="ml-auto border-l border-slate-700 pl-6">
          <span class="text-slate-500 text-xs">Projected balance</span>
          <div class="text-white font-bold text-lg">{{ fmt(projectedBalance) }}</div>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex gap-1 mb-4 bg-slate-800/50 rounded-lg p-1 w-fit">
      <button
        v-for="tab in [{ key: 'transactions', label: 'Transactions' }, { key: 'msi', label: 'Installments' }, { key: 'manual', label: 'Manual entries' }, { key: 'history', label: 'History' }]"
        :key="tab.key"
        @click="activeTab = tab.key"
        class="px-4 py-1.5 rounded-md text-sm transition-colors"
        :class="activeTab === tab.key
          ? 'bg-slate-700 text-white font-medium'
          : 'text-slate-400 hover:text-white'"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Tab content -->
    <div class="bg-slate-800 rounded-xl border border-slate-700 p-5">
      <div v-if="activeTab === 'transactions'">
        <TransactionList :transactions="transactions" />
      </div>

      <div v-if="activeTab === 'msi'">
        <InstallmentTracker :transactions="transactions" />
      </div>

      <div v-if="activeTab === 'history'">
        <div v-if="!historyChartData && !balanceChartData" class="text-slate-500 text-sm italic">No statements to show history yet.</div>
        <div v-else class="space-y-8">

          <!-- Balance over time -->
          <div v-if="balanceChartData">
            <div class="mb-3">
              <h3 class="text-slate-300 font-medium text-sm">Balance over time</h3>
              <p class="text-slate-500 text-xs mt-0.5">Statement balance per month</p>
            </div>
            <div class="h-64">
              <Line :data="balanceChartData" :options="balanceChartOptions" />
            </div>
          </div>

          <!-- Amounts breakdown -->
          <div v-if="historyChartData">
            <div class="mb-3 pt-2 border-t border-slate-700">
              <h3 class="text-slate-300 font-medium text-sm mt-4">Amounts per month</h3>
              <p class="text-slate-500 text-xs mt-0.5">Charges, MSI, payments and interest across all statements</p>
            </div>
            <div class="h-72">
              <Line :data="historyChartData" :options="historyChartOptions" />
            </div>
          </div>

        </div>
      </div>

      <div v-if="activeTab === 'manual'">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-slate-300 font-medium text-sm">
            Manual entries
            <span class="text-slate-500 text-xs ml-1">(cleared when the next statement is uploaded)</span>
          </h3>
          <button
            @click="showManualModal = true"
            :disabled="!selectedStatement"
            class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors disabled:opacity-40"
          >
            + Add
          </button>
        </div>

        <div v-if="!manualEntries.length" class="text-slate-500 text-sm italic">
          No manual entries
        </div>
        <div v-else class="space-y-1">
          <div
            v-for="entry in manualEntries"
            :key="entry.id"
            class="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-700/50 group"
          >
            <div class="flex items-center gap-3">
              <span
                class="w-2 h-2 rounded-full"
                :class="entry.amount < 0 ? 'bg-green-500' : 'bg-red-500'"
              ></span>
              <span class="text-slate-200 text-sm">{{ entry.description || (entry.amount < 0 ? 'Manual payment' : 'Manual charge') }}</span>
            </div>
            <div class="flex items-center gap-3">
              <span :class="entry.amount < 0 ? 'text-green-400' : 'text-red-400'" class="font-medium text-sm">
                {{ entry.amount < 0 ? '-' : '+' }}{{ new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Math.abs(entry.amount)) }}
              </span>
              <button
                @click="deleteManualEntry(entry.id)"
                class="text-slate-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 text-xs"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Manual Entry Modal -->
    <ManualEntryModal
      v-if="showManualModal && selectedStatement"
      :card-id="card.id"
      :year="selectedStatement.period_year"
      :month="selectedStatement.period_month"
      @close="showManualModal = false"
      @saved="showManualModal = false; loadManualEntries()"
    />
  </div>
</template>
