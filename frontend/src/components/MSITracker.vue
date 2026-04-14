<script setup>
import { computed } from 'vue'

const props = defineProps({
  transactions: { type: Array, default: () => [] },
})

const fmt = (n) =>
  n == null ? '—' : new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n)

// Group MSI transactions by a "plan" key (description + total_months)
const plans = computed(() => {
  const msiTxs = props.transactions.filter(t => t.type === 'msi')
  return msiTxs.map(tx => ({
    ...tx,
    progress: tx.msi_total_months ? Math.round((tx.msi_current_month / tx.msi_total_months) * 100) : null,
    remaining: tx.msi_total_months && tx.msi_current_month
      ? tx.msi_total_months - tx.msi_current_month
      : null,
    totalAmount: tx.msi_total_months && tx.msi_monthly_amount
      ? tx.msi_total_months * tx.msi_monthly_amount
      : null,
  }))
})
</script>

<template>
  <div>
    <div v-if="!plans.length" class="text-slate-500 text-sm italic">
      No installment plans this month
    </div>
    <div v-else class="space-y-4">
      <div
        v-for="plan in plans"
        :key="plan.id"
        class="bg-slate-900 rounded-lg p-4 border border-slate-700"
      >
        <div class="flex items-start justify-between mb-2">
          <div class="min-w-0 mr-4">
            <p class="text-slate-200 text-sm font-medium truncate">{{ plan.description }}</p>
            <p class="text-slate-500 text-xs mt-0.5">
              {{ fmt(plan.msi_monthly_amount) }}/mo
              <template v-if="plan.totalAmount"> · Total {{ fmt(plan.totalAmount) }}</template>
            </p>
          </div>
          <div class="text-right shrink-0">
            <span class="text-orange-400 font-semibold text-sm">
              {{ plan.msi_current_month }}/{{ plan.msi_total_months }} months
            </span>
            <div v-if="plan.remaining !== null" class="text-slate-500 text-xs">
              {{ plan.remaining }} remaining
            </div>
          </div>
        </div>

        <!-- Progress bar -->
        <div v-if="plan.progress !== null" class="mt-3">
          <div class="h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              class="h-full bg-orange-400 rounded-full transition-all"
              :style="{ width: plan.progress + '%' }"
            ></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
