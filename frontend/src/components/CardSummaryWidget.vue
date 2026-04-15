<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'

const props = defineProps({
  cardData: { type: Object, required: true },
})

const router = useRouter()

const { card, statement, summary } = props.cardData

const bankLabel = {
  bbva: 'BBVA',
  banamex: 'Banamex',
  santander: 'Santander',
  liverpool: 'Liverpool',
  other: 'Other',
}

const fmt = (n) =>
  n == null ? '—' : new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n)

const barWidth = computed(() => {
  const total = (summary.totalCharges || 0) + (summary.totalMsiMonthly || 0)
  if (!total) return { charges: 0, msi: 0 }
  return {
    charges: Math.round((summary.totalCharges / total) * 100),
    msi: Math.round((summary.totalMsiMonthly / total) * 100),
  }
})
</script>

<template>
  <div
    class="bg-slate-800 rounded-xl border border-slate-700 p-5 hover:border-slate-600 transition-colors cursor-pointer"
    @click="router.push(`/cards/${card.id}`)"
  >
    <!-- Card header -->
    <div class="flex items-start justify-between mb-4">
      <div>
        <div class="flex items-center gap-2 mb-1">
          <div class="w-3 h-3 rounded-full" :style="{ backgroundColor: card.color }"></div>
          <span class="text-xs font-medium text-slate-400 uppercase tracking-wide">
            {{ bankLabel[card.bank] || card.bank }}
          </span>
        </div>
        <h3 class="text-white font-semibold text-base">{{ card.alias }}</h3>
        <p v-if="card.last4" class="text-slate-500 text-xs mt-0.5">•••• {{ card.last4 }}</p>
      </div>

      <!-- Main figure: no-interest payment remaining -->
      <div class="text-right">
        <template v-if="summary.noInterestRemaining !== null">
          <div class="text-xs text-slate-500 mb-0.5">To pay (no interest)</div>
          <div class="text-xl font-bold" :class="summary.noInterestRemaining > 0 ? 'text-white' : 'text-green-400'">
            {{ fmt(summary.noInterestRemaining) }}
          </div>
          <div v-if="summary.hasNextStatement && summary.paidInNextStatement" class="text-xs mt-0.5 text-green-400">
            {{ fmt(summary.paidInNextStatement) }} paid (statement)
          </div>
          <div v-else-if="!summary.hasNextStatement && summary.manualBalance" class="text-xs mt-0.5 text-green-400">
            {{ fmt(Math.abs(summary.manualBalance)) }} paid (manual)
          </div>
        </template>
        <template v-else-if="summary.projectedBalance !== null">
          <div class="text-xs text-slate-500 mb-0.5">Balance</div>
          <div class="text-xl font-bold text-red-400">
            {{ fmt(summary.projectedBalance) }}
          </div>
        </template>
      </div>
    </div>

    <!-- No statement -->
    <div v-if="!statement" class="text-slate-500 text-sm italic">
      No statement for this month
    </div>

    <template v-else>
      <!-- Balance bar -->
      <div class="mb-3">
        <div class="flex h-2 rounded-full overflow-hidden bg-slate-700">
          <div class="bg-red-500 transition-all" :style="{ width: barWidth.charges + '%' }"></div>
          <div class="bg-orange-400 transition-all" :style="{ width: barWidth.msi + '%' }"></div>
        </div>
        <div class="flex justify-between text-xs text-slate-500 mt-1.5">
          <span><span class="inline-block w-2 h-2 rounded-full bg-red-500 mr-1"></span>Charges {{ fmt(summary.totalCharges) }}</span>
          <span><span class="inline-block w-2 h-2 rounded-full bg-orange-400 mr-1"></span>MSI {{ fmt(summary.totalMsiMonthly) }}</span>
        </div>
      </div>

      <!-- Footer -->
      <div class="grid grid-cols-3 gap-2 text-xs text-slate-400 border-t border-slate-700 pt-3">
        <div>
          <span class="text-slate-500">Min. payment</span>
          <div class="text-white font-medium">{{ fmt(statement.minimum_payment) }}</div>
        </div>
        <div class="text-center">
          <span class="text-slate-500">Due date</span>
          <div v-if="statement.minimum_payment === 0" class="text-green-400 font-medium">No payment due</div>
          <div v-else class="text-white font-medium">
            {{ statement.payment_due_date
              ? new Date(statement.payment_due_date + 'T00:00:00').toLocaleDateString('en-US')
              : '—' }}
          </div>
        </div>
        <div class="text-right">
          <span class="text-slate-500">Available</span>
          <div
            v-if="card.credit_limit != null && statement.total_balance != null"
            class="font-medium"
            :class="(card.credit_limit - statement.total_balance) < 0 ? 'text-red-400' : 'text-green-400'"
          >
            {{ fmt(card.credit_limit - statement.total_balance) }}
          </div>
          <div v-else class="text-slate-500 font-medium">—</div>
        </div>
      </div>
    </template>
  </div>
</template>
