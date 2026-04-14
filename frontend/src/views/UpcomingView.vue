<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { msiApi } from '../api/index.js'
import { useProfileStore } from '../stores/profile.js'

const router = useRouter()
const data = ref(null)
const loading = ref(true)
const profileStore = useProfileStore()

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const BANK_LABEL = { bbva: 'BBVA', banamex: 'Banamex', santander: 'Santander', other: 'Other' }

const fmt = (n) =>
  n == null ? '—' : new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN',
    minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)

async function loadData() {
  loading.value = true
  data.value = await msiApi.get(profileStore.activeProfileId)
  loading.value = false
}

onMounted(loadData)
watch(() => profileStore.activeProfileId, loadData)

const toKey = (year, month) => year * 12 + month
const keyToYM = (key) => ({ year: Math.floor((key - 1) / 12), month: ((key - 1) % 12) + 1 })

const now = new Date()
const todayKey = toKey(now.getFullYear(), now.getMonth() + 1)

const monthColumns = computed(() => {
  if (!data.value?.cards.length) return []

  let maxKey = todayKey + 11

  for (const card of data.value.cards) {
    // MSI plans end date
    const base = toKey(card.statement.period_year, card.statement.period_month)
    for (const plan of card.plans) {
      const end = base + (plan.remaining_months ?? 0)
      if (end > maxKey) maxKey = end
    }
    // Charges due date
    if (card.charges.length) {
      const dueKey = toKey(card.statement.due_year, card.statement.due_month)
      if (dueKey > maxKey) maxKey = dueKey
    }
  }

  const cols = []
  for (let k = todayKey; k <= maxKey; k++) cols.push({ key: k, ...keyToYM(k) })
  return cols
})

const yearGroups = computed(() => {
  const map = new Map()
  for (const col of monthColumns.value) {
    map.set(col.year, (map.get(col.year) ?? 0) + 1)
  }
  return Array.from(map.entries()).map(([year, count]) => ({ year, count }))
})

// MSI plan amount for a column
function planAmountForMonth(plan, statement, colKey) {
  const base = toKey(statement.period_year, statement.period_month)
  const end = base + (plan.remaining_months ?? 0)
  if (colKey >= base && colKey <= end) return plan.msi_monthly_amount ?? plan.amount
  return 0
}

// Charge amount for a column (one-time, only in due month)
function chargeAmountForMonth(card, colKey) {
  const dueKey = toKey(card.statement.due_year, card.statement.due_month)
  if (colKey !== dueKey) return 0
  return card.charges.reduce((s, c) => s + c.amount, 0)
}

// Manual payments applied to the due month (negative amounts = payments)
function manualAmountForMonth(cardData, colKey) {
  const dueKey = toKey(cardData.statement.due_year, cardData.statement.due_month)
  if (colKey !== dueKey) return 0
  return cardData.manualBalance // already negative for payments
}

function interestAmountForMonth(cardData, colKey) {
  if (!cardData.totalInterest) return 0
  const dueKey = toKey(cardData.statement.due_year, cardData.statement.due_month)
  return colKey === dueKey ? cardData.totalInterest : 0
}

// Card subtotal for a column (MSI + charges + interest + manual payments)
function cardTotalForMonth(cardData, colKey) {
  const msi = cardData.plans.reduce((s, p) => s + planAmountForMonth(p, cardData.statement, colKey), 0)
  const charges = chargeAmountForMonth(cardData, colKey)
  const interest = interestAmountForMonth(cardData, colKey)
  const manual = manualAmountForMonth(cardData, colKey)
  return msi + charges + interest + manual
}

const grandTotalForMonth = (colKey) =>
  (data.value?.cards ?? []).reduce((s, c) => s + cardTotalForMonth(c, colKey), 0)

const collapsed = ref(new Set())
function toggleCard(id) {
  if (collapsed.value.has(id)) collapsed.value.delete(id)
  else collapsed.value.add(id)
  collapsed.value = new Set(collapsed.value)
}
function collapseAll() {
  collapsed.value = new Set((data.value?.cards ?? []).map(c => c.card.id))
}
function expandAll() {
  collapsed.value = new Set()
}

function pctClass(pct) {
  if (pct >= 75) return 'text-green-400'
  if (pct >= 40) return 'text-yellow-400'
  return 'text-slate-400'
}
</script>

<template>
  <div>
    <div class="flex items-end justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-white">Upcoming Payments</h1>
        <p class="text-slate-400 text-sm mt-1">Installment plans and charges from the latest statement of each card</p>
      </div>
      <div class="flex gap-2">
        <button @click="collapseAll" class="text-xs text-slate-400 hover:text-white transition-colors px-2 py-1">Collapse all</button>
        <button @click="expandAll" class="text-xs text-slate-400 hover:text-white transition-colors px-2 py-1">Expand all</button>
      </div>
    </div>

    <div v-if="loading" class="text-slate-400 text-center py-12">Loading...</div>

    <template v-else-if="data">
      <div class="flex gap-4 mb-6">
        <div class="bg-slate-800 border border-slate-700 rounded-xl px-5 py-3">
          <div class="text-slate-400 text-xs mb-0.5">Monthly MSI commitment</div>
          <div class="text-xl font-bold text-orange-400">{{ fmt(data.grandTotalMonthly) }}<span class="text-sm font-normal text-slate-500">/mo</span></div>
        </div>
        <div class="bg-slate-800 border border-slate-700 rounded-xl px-5 py-3">
          <div class="text-slate-400 text-xs mb-0.5">Total MSI remaining</div>
          <div class="text-xl font-bold text-white">{{ fmt(data.grandTotalRemaining) }}</div>
        </div>
        <div class="bg-slate-800 border border-slate-700 rounded-xl px-5 py-3">
          <div class="text-slate-400 text-xs mb-0.5">Charges this period</div>
          <div class="text-xl font-bold text-red-400">{{ fmt(data.grandTotalCharges) }}</div>
        </div>
          <div v-if="data.grandManualBalance" class="bg-slate-800 border border-slate-700 rounded-xl px-5 py-3">
          <div class="text-slate-400 text-xs mb-0.5">Manual payments</div>
          <div class="text-xl font-bold text-green-400">{{ fmt(Math.abs(data.grandManualBalance)) }}</div>
        </div>
        <div class="bg-indigo-950 border border-indigo-700 rounded-xl px-5 py-3 ml-auto">
          <div class="text-indigo-300 text-xs mb-0.5">Due {{ MONTHS[monthColumns[0]?.month - 1] }} {{ monthColumns[0]?.year }}</div>
          <div class="text-3xl font-bold text-white">{{ fmt(grandTotalForMonth(todayKey)) }}</div>
          <div class="text-indigo-400 text-xs mt-0.5">total to pay this month</div>
        </div>
      </div>

      <div v-if="!data.cards.length" class="text-slate-500 text-center py-12 italic">No data found</div>

      <div v-else class="overflow-x-auto rounded-xl border border-slate-700">
        <table class="text-sm border-collapse min-w-full">
          <thead>
            <!-- Year row -->
            <tr class="bg-slate-900">
              <th class="sticky left-0 z-20 bg-slate-900 px-4 py-2 text-left text-slate-500 font-medium border-b border-r border-slate-700 min-w-52">Concept</th>
              <th class="px-3 py-2 text-right text-slate-500 font-medium border-b border-slate-700 whitespace-nowrap min-w-24">Original</th>
              <th class="px-3 py-2 text-right text-slate-500 font-medium border-b border-slate-700 whitespace-nowrap min-w-24">Paid</th>
              <th class="px-3 py-2 text-right text-slate-500 font-medium border-b border-slate-700 whitespace-nowrap min-w-24">Balance</th>
              <th class="px-3 py-2 text-right text-indigo-400 font-medium border-b border-l border-slate-700 whitespace-nowrap min-w-24">Due now</th>
              <th class="px-3 py-2 text-center text-slate-500 font-medium border-b border-slate-700 min-w-12">%</th>
              <th class="px-3 py-2 text-center text-slate-500 font-medium border-b border-slate-700 min-w-12">Mo.</th>
              <th
                v-for="yg in yearGroups" :key="yg.year"
                :colspan="yg.count"
                class="px-2 py-2 text-center text-slate-300 font-semibold border-b border-l border-slate-700"
              >{{ yg.year }}</th>
            </tr>
            <!-- Month row -->
            <tr class="bg-slate-900">
              <th class="sticky left-0 z-20 bg-slate-900 border-b border-r border-slate-700 px-4 py-1.5 text-left text-xs text-slate-600">
                as of latest statement
              </th>
              <th class="border-b border-slate-700"></th>
              <th class="border-b border-slate-700"></th>
              <th class="border-b border-slate-700"></th>
              <th class="border-b border-l border-slate-700"></th>
              <th class="border-b border-slate-700"></th>
              <th class="border-b border-slate-700"></th>
              <th
                v-for="col in monthColumns" :key="col.key"
                class="px-2 py-1.5 text-center text-xs font-medium border-b border-l border-slate-700 min-w-20"
                :class="col.key === todayKey ? 'bg-indigo-950 text-indigo-300' : 'text-slate-400'"
              >{{ MONTHS[col.month - 1] }}</th>
            </tr>
          </thead>

          <tbody>
            <template v-for="cardData in data.cards" :key="cardData.card.id">
              <!-- Card subtotal row -->
              <tr
                class="bg-slate-800/60 cursor-pointer hover:bg-slate-700/40 transition-colors"
                @click="toggleCard(cardData.card.id)"
              >
                <td class="sticky left-0 z-10 bg-slate-800 border-t border-r border-slate-700 px-4 py-2.5">
                  <div class="flex items-center gap-2">
                    <div class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ backgroundColor: cardData.card.color }"></div>
                    <span class="text-white font-semibold">{{ cardData.card.alias }}</span>
                    <span class="text-slate-500 text-xs">{{ BANK_LABEL[cardData.card.bank] || cardData.card.bank }}</span>
                    <span class="text-slate-500 text-xs ml-auto">{{ collapsed.has(cardData.card.id) ? '▸' : '▾' }}</span>
                  </div>
                </td>
                <td class="border-t border-slate-700 px-3 py-2.5 text-right text-slate-300 font-medium">
                  {{ fmt(cardData.plans.reduce((s,p) => s + (p.msi_monthly_amount ?? p.amount) * (p.msi_total_months ?? 1), 0) + cardData.totalCharges) }}
                </td>
                <td class="border-t border-slate-700 px-3 py-2.5 text-right text-green-400 font-medium">
                  {{ fmt(cardData.plans.reduce((s,p) => s + (p.msi_monthly_amount ?? p.amount) * (p.msi_current_month ?? 0), 0)) }}
                </td>
                <td class="border-t border-slate-700 px-3 py-2.5 text-right text-white font-semibold">
                  {{ fmt(cardData.totalRemaining + cardData.totalCharges) }}
                </td>
                <td class="border-t border-l border-slate-700 px-3 py-2.5 text-right font-bold"
                  :class="(cardData.statement.total_balance + cardData.manualBalance) <= 0 ? 'text-green-400' : 'text-indigo-300'"
                >
                  {{ fmt(cardData.statement.total_balance != null ? cardData.statement.total_balance + cardData.manualBalance : null) }}
                </td>
                <td class="border-t border-slate-700 px-3 py-2.5"></td>
                <td class="border-t border-slate-700 px-3 py-2.5 text-center text-orange-400 font-semibold">
                  {{ fmt(cardData.totalMonthly) }}
                </td>
                <td
                  v-for="col in monthColumns" :key="col.key"
                  class="border-t border-l border-slate-700 px-2 py-2.5 text-center font-semibold"
                  :class="col.key === todayKey ? 'bg-indigo-950/40' : ''"
                >
                  <span v-if="cardTotalForMonth(cardData, col.key)" class="text-white">
                    {{ fmt(cardTotalForMonth(cardData, col.key)) }}
                  </span>
                  <span v-else class="text-slate-700">—</span>
                </td>
              </tr>

              <!-- MSI plan rows -->
              <tr v-for="plan in cardData.plans" :key="plan.id" v-show="!collapsed.has(cardData.card.id)" class="hover:bg-slate-800/30 transition-colors">
                <td class="sticky left-0 z-10 bg-slate-950 border-t border-r border-slate-700/50 px-4 py-2 pl-9">
                  <div class="text-slate-300 truncate max-w-xs">{{ plan.description }}</div>
                  <div class="text-slate-600 text-xs">{{ plan.date }}</div>
                </td>
                <td class="border-t border-slate-700/50 px-3 py-2 text-right text-slate-400">
                  {{ plan.msi_total_months ? fmt((plan.msi_monthly_amount ?? plan.amount) * plan.msi_total_months) : '—' }}
                </td>
                <td class="border-t border-slate-700/50 px-3 py-2 text-right text-green-400">
                  {{ plan.msi_current_month ? fmt((plan.msi_monthly_amount ?? plan.amount) * plan.msi_current_month) : '—' }}
                </td>
                <td class="border-t border-slate-700/50 px-3 py-2 text-right text-slate-200">
                  {{ fmt(plan.remaining_amount) }}
                </td>
                <td class="border-t border-l border-slate-700/50 px-3 py-2"></td>
                <td class="border-t border-slate-700/50 px-3 py-2 text-center">
                  <span v-if="plan.msi_total_months" :class="pctClass(plan.msi_current_month / plan.msi_total_months * 100)">
                    {{ Math.round(plan.msi_current_month / plan.msi_total_months * 100) }}%
                  </span>
                  <span v-else class="text-slate-600">—</span>
                </td>
                <td class="border-t border-slate-700/50 px-3 py-2 text-center text-slate-400">
                  {{ plan.remaining_months ?? '—' }}
                </td>
                <td
                  v-for="col in monthColumns" :key="col.key"
                  class="border-t border-l border-slate-700/50 px-2 py-2 text-center text-xs"
                  :class="col.key === todayKey ? 'bg-indigo-950/30' : ''"
                >
                  <span v-if="planAmountForMonth(plan, cardData.statement, col.key)" class="text-orange-300">
                    {{ fmt(planAmountForMonth(plan, cardData.statement, col.key)) }}
                  </span>
                </td>
              </tr>

              <!-- Interest row (single row per card, shown in due month) -->
              <tr v-if="cardData.totalInterest" v-show="!collapsed.has(cardData.card.id)" class="hover:bg-slate-800/30 transition-colors">
                <td class="sticky left-0 z-10 bg-slate-950 border-t border-r border-slate-700/50 px-4 py-2 pl-9">
                  <div class="text-yellow-400 truncate max-w-xs">Interest / IVA</div>
                  <div class="text-slate-600 text-xs">1 month</div>
                </td>
                <td class="border-t border-slate-700/50 px-3 py-2 text-right text-yellow-400">{{ fmt(cardData.totalInterest) }}</td>
                <td class="border-t border-slate-700/50 px-3 py-2 text-right text-slate-600">—</td>
                <td class="border-t border-slate-700/50 px-3 py-2 text-right text-yellow-400">{{ fmt(cardData.totalInterest) }}</td>
                <td class="border-t border-l border-slate-700/50 px-3 py-2"></td>
                <td class="border-t border-slate-700/50 px-3 py-2 text-center text-slate-600">—</td>
                <td class="border-t border-slate-700/50 px-3 py-2 text-center text-slate-500">1</td>
                <td
                  v-for="col in monthColumns" :key="col.key"
                  class="border-t border-l border-slate-700/50 px-2 py-2 text-center text-xs"
                  :class="col.key === todayKey ? 'bg-indigo-950/30' : ''"
                >
                  <span v-if="col.key === toKey(cardData.statement.due_year, cardData.statement.due_month)" class="text-yellow-400">
                    {{ fmt(cardData.totalInterest) }}
                  </span>
                </td>
              </tr>

              <!-- Manual payment rows (shown in due month column, green) -->
              <tr v-for="entry in cardData.manualEntries" :key="'m-' + entry.id" v-show="!collapsed.has(cardData.card.id)" class="hover:bg-slate-800/30 transition-colors">
                <td class="sticky left-0 z-10 bg-slate-950 border-t border-r border-slate-700/50 px-4 py-2 pl-9">
                  <div class="text-green-400 truncate max-w-xs">{{ entry.description || (entry.amount < 0 ? 'Manual payment' : 'Manual charge') }}</div>
                  <div class="text-slate-600 text-xs">manual entry</div>
                </td>
                <td class="border-t border-slate-700/50 px-3 py-2 text-right text-slate-600">—</td>
                <td class="border-t border-slate-700/50 px-3 py-2 text-right text-slate-600">—</td>
                <td class="border-t border-slate-700/50 px-3 py-2 text-right" :class="entry.amount < 0 ? 'text-green-400' : 'text-red-400'">
                  {{ entry.amount < 0 ? '-' : '+' }}{{ fmt(Math.abs(entry.amount)) }}
                </td>
                <td class="border-t border-l border-slate-700/50 px-3 py-2"></td>
                <td class="border-t border-slate-700/50 px-3 py-2 text-center text-slate-600">—</td>
                <td class="border-t border-slate-700/50 px-3 py-2 text-center text-slate-600">—</td>
                <td
                  v-for="col in monthColumns" :key="col.key"
                  class="border-t border-l border-slate-700/50 px-2 py-2 text-center text-xs"
                  :class="col.key === todayKey ? 'bg-indigo-950/30' : ''"
                >
                  <span
                    v-if="col.key === toKey(cardData.statement.due_year, cardData.statement.due_month)"
                    :class="entry.amount < 0 ? 'text-green-400' : 'text-red-400'"
                  >
                    {{ entry.amount < 0 ? '-' : '+' }}{{ fmt(Math.abs(entry.amount)) }}
                  </span>
                </td>
              </tr>

              <!-- Charge rows (one row per charge, shown in due month column) -->
              <tr v-for="charge in cardData.charges" :key="charge.id" v-show="!collapsed.has(cardData.card.id)" class="hover:bg-slate-800/30 transition-colors">
                <td class="sticky left-0 z-10 bg-slate-950 border-t border-r border-slate-700/50 px-4 py-2 pl-9">
                  <div class="text-slate-400 truncate max-w-xs">{{ charge.description }}</div>
                  <div class="text-slate-600 text-xs">{{ charge.date }} · 1 month</div>
                </td>
                <td class="border-t border-slate-700/50 px-3 py-2 text-right text-slate-400">{{ fmt(charge.amount) }}</td>
                <td class="border-t border-slate-700/50 px-3 py-2 text-right text-slate-600">{{ fmt(0) }}</td>
                <td class="border-t border-slate-700/50 px-3 py-2 text-right text-slate-300">{{ fmt(charge.amount) }}</td>
                <td class="border-t border-l border-slate-700/50 px-3 py-2"></td>
                <td class="border-t border-slate-700/50 px-3 py-2 text-center text-slate-600">0%</td>
                <td class="border-t border-slate-700/50 px-3 py-2 text-center text-slate-500">1</td>
                <td
                  v-for="col in monthColumns" :key="col.key"
                  class="border-t border-l border-slate-700/50 px-2 py-2 text-center text-xs"
                  :class="col.key === todayKey ? 'bg-indigo-950/30' : ''"
                >
                  <span
                    v-if="col.key === toKey(cardData.statement.due_year, cardData.statement.due_month)"
                    class="text-red-400"
                  >
                    {{ fmt(charge.amount) }}
                  </span>
                </td>
              </tr>
            </template>

            <!-- Grand total row -->
            <tr class="bg-slate-900 border-t-2 border-slate-600">
              <td class="sticky left-0 z-10 bg-slate-900 border-r border-slate-600 px-4 py-3 text-white font-bold">Total</td>
              <td class="px-3 py-3 text-right text-slate-300 font-semibold">
                {{ fmt(data.cards.reduce((s,c) => s + c.plans.reduce((ps,p) => ps + (p.msi_monthly_amount ?? p.amount) * (p.msi_total_months ?? 1), 0) + c.totalCharges, 0)) }}
              </td>
              <td class="px-3 py-3 text-right text-green-400 font-semibold">
                {{ fmt(data.cards.reduce((s,c) => s + c.plans.reduce((ps,p) => ps + (p.msi_monthly_amount ?? p.amount) * (p.msi_current_month ?? 0), 0), 0)) }}
              </td>
              <td class="px-3 py-3 text-right text-white font-bold">
                {{ fmt(data.grandTotalRemaining + data.grandTotalCharges) }}
              </td>
              <td class="px-3 py-3 text-right font-bold border-l border-slate-600"
                :class="(data.cards.reduce((s,c) => s + (c.statement.total_balance ?? 0) + c.manualBalance, 0)) <= 0 ? 'text-green-400' : 'text-indigo-300'"
              >
                {{ fmt(data.cards.reduce((s,c) => s + (c.statement.total_balance ?? 0) + c.manualBalance, 0)) }}
              </td>
              <td class="px-3 py-3"></td>
              <td class="px-3 py-3 text-center text-orange-400 font-bold">{{ fmt(data.grandTotalMonthly) }}</td>
              <td
                v-for="col in monthColumns" :key="col.key"
                class="border-l border-slate-600 px-2 py-3 text-center font-bold"
                :class="col.key === todayKey ? 'bg-indigo-950/40' : ''"
              >
                <span v-if="grandTotalForMonth(col.key)" class="text-orange-400">
                  {{ fmt(grandTotalForMonth(col.key)) }}
                </span>
                <span v-else class="text-slate-700">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
