<script setup>
import { computed } from 'vue'

const props = defineProps({
  transactions: { type: Array, default: () => [] },
})

const fmt = (n) =>
  n == null ? '—' : new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n)

const fmtDate = (d) => {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${m}/${day}/${y}`
}

const typeColor = {
  charge:   { dot: 'bg-red-500',    text: 'text-red-400' },
  msi:      { dot: 'bg-orange-400', text: 'text-orange-400' },
  payment:  { dot: 'bg-green-500',  text: 'text-green-400' },
  interest: { dot: 'bg-yellow-500', text: 'text-yellow-400' },
}

// Group transactions by date, preserving chronological order
const groupedByDate = computed(() => {
  const map = new Map()
  for (const tx of props.transactions) {
    const key = tx.date || '—'
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(tx)
  }
  // Sort dates descending (most recent first)
  return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a))
})
</script>

<template>
  <div>
    <div v-if="!transactions.length" class="text-slate-500 text-sm italic py-4 text-center">
      No transactions
    </div>

    <div v-else class="space-y-4">
      <div v-for="[date, txs] in groupedByDate" :key="date">
        <!-- Date header -->
        <div class="flex items-center gap-3 mb-1">
          <span class="text-slate-500 text-xs font-semibold">{{ fmtDate(date) }}</span>
          <div class="flex-1 h-px bg-slate-700/60"></div>
        </div>

        <!-- Transactions for this date -->
        <div class="space-y-0.5">
          <div
            v-for="tx in txs"
            :key="tx.id"
            class="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-700/50 transition-colors"
          >
            <div class="flex items-center gap-3 min-w-0">
              <span
                class="w-2 h-2 rounded-full shrink-0"
                :class="typeColor[tx.type]?.dot"
              ></span>
              <div class="min-w-0">
                <div class="text-slate-200 text-sm truncate max-w-sm">{{ tx.description }}</div>
                <div v-if="tx.type === 'msi' && tx.msi_total_months" class="text-orange-400 text-xs">
                  {{ tx.msi_current_month }}/{{ tx.msi_total_months }} months · installment
                </div>
              </div>
            </div>
            <div class="ml-4 shrink-0 text-right">
              <div
                class="font-medium text-sm"
                :class="typeColor[tx.type]?.text"
              >
                {{ tx.type === 'payment' ? '-' : '+' }}{{ fmt(Math.abs(tx.type === 'msi' ? (tx.msi_monthly_amount ?? tx.amount) : tx.amount)) }}
              </div>
              <div v-if="tx.type === 'msi'" class="text-slate-500 text-xs">/mo</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Legend -->
    <div v-if="transactions.length" class="flex flex-wrap gap-4 mt-4 pt-3 border-t border-slate-700/50 text-xs text-slate-500">
      <span><span class="inline-block w-2 h-2 rounded-full bg-red-500 mr-1"></span>Charge</span>
      <span><span class="inline-block w-2 h-2 rounded-full bg-orange-400 mr-1"></span>Installment (MSI)</span>
      <span><span class="inline-block w-2 h-2 rounded-full bg-green-500 mr-1"></span>Payment</span>
      <span><span class="inline-block w-2 h-2 rounded-full bg-yellow-500 mr-1"></span>Interest / IVA</span>
    </div>
  </div>
</template>
