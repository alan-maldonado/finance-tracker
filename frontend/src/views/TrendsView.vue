<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { Line, Bar } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { useProfileStore } from '../stores/profile.js'
import { trendsApi } from '../api/index.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler)

const profileStore = useProfileStore()
const data = ref(null)
const range = ref(6)
const loading = ref(false)

const RANGES = [
  { label: '3M', value: 3 },
  { label: '6M', value: 6 },
  { label: '12M', value: 12 },
  { label: 'All', value: 0 },
]

const fmt = (n) =>
  n == null
    ? '—'
    : new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)

const fmtCompact = (n) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', notation: 'compact', maximumFractionDigits: 1 }).format(n)

async function load() {
  loading.value = true
  try {
    data.value = await trendsApi.get(profileStore.activeProfileId, range.value)
  } finally {
    loading.value = false
  }
}

watch([() => profileStore.activeProfileId, range], load)
onMounted(load)

// ── Shared chart config ────────────────────────────────────────────────────
const xScale = {
  grid: { color: 'rgba(148,163,184,0.08)' },
  ticks: { color: '#94a3b8', font: { size: 11 } },
  border: { color: 'rgba(148,163,184,0.15)' },
}

const yScale = {
  grid: { color: 'rgba(148,163,184,0.08)' },
  ticks: {
    color: '#94a3b8',
    font: { size: 11 },
    callback: (v) => fmtCompact(v),
  },
  border: { color: 'rgba(148,163,184,0.15)' },
}

const sharedTooltip = {
  backgroundColor: '#1e293b',
  borderColor: '#334155',
  borderWidth: 1,
  titleColor: '#e2e8f0',
  bodyColor: '#94a3b8',
  padding: 10,
  callbacks: {
    label: (ctx) => ctx.raw == null ? null : ` ${ctx.dataset.label}: ${fmt(ctx.raw)}`,
  },
}

const sharedLegend = {
  labels: {
    color: '#94a3b8',
    usePointStyle: true,
    pointStyleWidth: 10,
    font: { size: 12 },
    padding: 16,
  },
}

// ── Chart 1: Balance por tarjeta (Line) ───────────────────────────────────
const balanceChartData = computed(() => {
  if (!data.value?.cards?.length) return null
  return {
    labels: data.value.months,
    datasets: data.value.cards.map(card => ({
      label: card.alias,
      data: card.balances,
      borderColor: card.color,
      backgroundColor: card.color + '18',
      pointBackgroundColor: card.color,
      pointBorderColor: card.color,
      pointRadius: 4,
      pointHoverRadius: 6,
      borderWidth: 2,
      tension: 0.35,
      spanGaps: false,
      fill: false,
    })),
  }
})

const balanceChartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: sharedLegend,
    tooltip: sharedTooltip,
  },
  scales: { x: xScale, y: yScale },
}))

// ── Chart 2: Obligaciones mensuales (Stacked Bar) ─────────────────────────
const obligationsChartData = computed(() => {
  if (!data.value?.months?.length) return null
  return {
    labels: data.value.months,
    datasets: [
      {
        label: 'Charges',
        data: data.value.totals.charges,
        backgroundColor: 'rgba(239,68,68,0.7)',
        borderColor: 'rgba(239,68,68,0.9)',
        borderWidth: 1,
        stack: 'obligations',
      },
      {
        label: 'Monthly MSI',
        data: data.value.totals.msiMonthly,
        backgroundColor: 'rgba(251,146,60,0.7)',
        borderColor: 'rgba(251,146,60,0.9)',
        borderWidth: 1,
        stack: 'obligations',
      },
    ],
  }
})

const obligationsChartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: sharedLegend,
    tooltip: sharedTooltip,
  },
  scales: {
    x: { ...xScale, stacked: true },
    y: { ...yScale, stacked: true },
  },
}))
</script>

<template>
  <div>
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-white font-bold text-2xl">Trends</h1>
      <div class="flex gap-1 bg-slate-800 border border-slate-700 rounded-lg p-1">
        <button
          v-for="r in RANGES"
          :key="r.value"
          @click="range = r.value"
          class="px-3 py-1 rounded-md text-sm transition-colors"
          :class="range === r.value
            ? 'bg-slate-600 text-white font-medium'
            : 'text-slate-400 hover:text-white'"
        >
          {{ r.label }}
        </button>
      </div>
    </div>

    <!-- States -->
    <div v-if="loading" class="text-slate-400 text-sm py-12 text-center">Loading...</div>
    <div v-else-if="!data?.months?.length" class="text-slate-500 text-sm italic py-12 text-center">
      No statement data yet.
    </div>

    <!-- Charts -->
    <div v-else class="space-y-6">

      <!-- Balance por tarjeta -->
      <div class="bg-slate-800 rounded-xl border border-slate-700 p-5">
        <div class="mb-4">
          <h2 class="text-white font-semibold">Balance per card</h2>
          <p class="text-slate-500 text-xs mt-0.5">Statement balance month by month</p>
        </div>
        <div class="h-72">
          <Line :data="balanceChartData" :options="balanceChartOptions" />
        </div>
      </div>

      <!-- Obligaciones mensuales -->
      <div class="bg-slate-800 rounded-xl border border-slate-700 p-5">
        <div class="mb-4">
          <h2 class="text-white font-semibold">Monthly obligations</h2>
          <p class="text-slate-500 text-xs mt-0.5">Charges + monthly MSI installments per month</p>
        </div>
        <div class="h-72">
          <Bar :data="obligationsChartData" :options="obligationsChartOptions" />
        </div>
      </div>

    </div>
  </div>
</template>
