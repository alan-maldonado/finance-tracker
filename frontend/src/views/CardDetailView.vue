<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useCardsStore } from '../stores/cards.js'
import { useProfileStore } from '../stores/profile.js'
import { statementsApi, transactionsApi, manualEntriesApi } from '../api/index.js'
import TransactionList from '../components/TransactionList.vue'
import MSITracker from '../components/MSITracker.vue'
import ManualEntryModal from '../components/ManualEntryModal.vue'

const props = defineProps({ id: { type: String, required: true } })
const router = useRouter()
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
  bbva: 'BBVA',
  banamex: 'Banamex',
  santander: 'Santander',
  other: 'Other',
}

const fmt = (n) =>
  n == null ? '—' : new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n)

const totalCharges = computed(() =>
  transactions.value.filter(t => t.type === 'charge').reduce((s, t) => s + t.amount, 0)
)
const totalMsi = computed(() =>
  transactions.value.filter(t => t.type === 'msi').reduce((s, t) => s + (t.msi_monthly_amount || t.amount), 0)
)
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

async function loadStatements() {
  if (!card.value) return
  statements.value = await statementsApi.list({ card_id: card.value.id })
  if (statements.value.length) {
    selectedStatementId.value = statements.value[0].id
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

watch(selectedStatementId, async () => {
  await loadTransactions()
  await loadManualEntries()
})

onMounted(async () => {
  await cardsStore.fetchCards(profileStore.activeProfileId)
  await loadStatements()
  await loadTransactions()
  await loadManualEntries()
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
              {{ MONTHS[(s.period_month - 1)] }} {{ s.period_year }}
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
        v-for="tab in [{ key: 'transactions', label: 'Transactions' }, { key: 'msi', label: 'MSI Tracker' }, { key: 'manual', label: 'Manual entries' }]"
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
        <MSITracker :transactions="transactions" />
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
