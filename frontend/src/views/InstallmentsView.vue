<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { msiApi } from '../api/index.js'
import { useProfileStore } from '../stores/profile.js'

const router = useRouter()
const data = ref(null)
const loading = ref(true)
const profileStore = useProfileStore()

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const BANK_LABEL = { banamex: 'Banamex', santander: 'Santander', liverpool: 'Liverpool', amex: 'Amex', other: 'Other' }

const fmt = (n) =>
  n == null ? '—' : new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n)

async function loadData() {
  loading.value = true
  data.value = await msiApi.get(profileStore.activeProfileId)
  loading.value = false
}

onMounted(loadData)
watch(() => profileStore.activeProfileId, loadData)
</script>

<template>
  <div>
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-white">Installment Plans</h1>
      <p class="text-slate-400 text-sm mt-1">Active installment plans from the latest statement of each card</p>
    </div>

    <div v-if="loading" class="text-slate-400 text-center py-12">Loading...</div>

    <template v-else-if="data">
      <div class="grid grid-cols-2 gap-4 mb-8">
        <div class="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <div class="text-slate-400 text-sm mb-1">Monthly installment commitment</div>
          <div class="text-3xl font-bold text-orange-400">{{ fmt(data.grandTotalMonthly) }}</div>
          <div class="text-slate-500 text-xs mt-1">charged every month across all cards</div>
        </div>
        <div class="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <div class="text-slate-400 text-sm mb-1">Total remaining debt (installments)</div>
          <div class="text-3xl font-bold text-white">{{ fmt(data.grandTotalRemaining) }}</div>
          <div class="text-slate-500 text-xs mt-1">sum of all pending installments</div>
        </div>
      </div>

      <div v-if="!data.cards.length" class="text-slate-500 text-center py-12 italic">
        No active installment plans found
      </div>

      <div v-else class="space-y-6">
        <div
          v-for="cardData in data.cards"
          :key="cardData.card.id"
          class="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden"
        >
          <div
            class="flex items-center justify-between px-5 py-4 border-b border-slate-700 cursor-pointer hover:bg-slate-700/40 transition-colors"
            @click="router.push(`/cards/${cardData.card.id}`)"
          >
            <div class="flex items-center gap-3">
              <div class="w-3 h-3 rounded-full shrink-0" :style="{ backgroundColor: cardData.card.color }"></div>
              <div>
                <span class="text-white font-semibold">{{ cardData.card.alias }}</span>
                <span class="text-slate-500 text-sm ml-2">
                  {{ BANK_LABEL[cardData.card.bank] || cardData.card.bank }}
                  <template v-if="cardData.card.last4"> · •••• {{ cardData.card.last4 }}</template>
                </span>
                <span class="text-slate-600 text-xs ml-3">
                  as of {{ MONTHS[cardData.statement.period_month - 1] }} {{ cardData.statement.period_year }}
                </span>
              </div>
            </div>
            <div class="text-right">
              <div class="text-orange-400 font-semibold">{{ fmt(cardData.totalMonthly) }}<span class="text-slate-500 text-xs font-normal">/mo</span></div>
              <div class="text-slate-400 text-xs">{{ fmt(cardData.totalRemaining) }} remaining</div>
            </div>
          </div>

          <div class="divide-y divide-slate-700/50">
            <div
              v-for="plan in cardData.plans"
              :key="plan.id"
              class="flex items-center gap-4 px-5 py-3"
            >
              <div class="flex-1 min-w-0">
                <div class="text-slate-200 text-sm truncate">{{ plan.description }}</div>
                <div class="text-slate-500 text-xs mt-0.5">started {{ plan.date }}</div>
              </div>
              <div class="w-36 shrink-0">
                <div class="flex justify-between text-xs text-slate-500 mb-1">
                  <span>{{ plan.msi_current_month }}/{{ plan.msi_total_months }} months</span>
                  <span>{{ plan.remaining_months }} left</span>
                </div>
                <div class="h-1.5 rounded-full bg-slate-700 overflow-hidden">
                  <div
                    class="h-full bg-orange-400 rounded-full"
                    :style="{ width: plan.msi_total_months
                      ? Math.round((plan.msi_current_month / plan.msi_total_months) * 100) + '%'
                      : '0%' }"
                  ></div>
                </div>
              </div>
              <div class="text-right shrink-0 w-36">
                <div class="text-orange-400 font-medium text-sm">{{ fmt(plan.msi_monthly_amount) }}<span class="text-slate-500 text-xs">/mo</span></div>
                <div class="text-slate-400 text-xs">{{ fmt(plan.remaining_amount) }} left</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
