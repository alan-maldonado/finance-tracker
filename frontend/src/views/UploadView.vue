<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useCardsStore } from '../stores/cards.js'
import { statementsApi } from '../api/index.js'

const router = useRouter()
const route = useRoute()
const cardsStore = useCardsStore()

const selectedCardId = ref('')
const dragOver = ref(false)
const file = ref(null)
const password = ref('')
const needsPassword = ref(false)
const preview = ref(null)
const uploading = ref(false)
const parsing = ref(false)
const error = ref(null)
const success = ref(null)

const fmt = (n) =>
  n == null ? '—' : new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n)

const MONTHS = ['January','February','March','April','May','June',
                 'July','August','September','October','November','December']

function handleDrop(e) {
  dragOver.value = false
  const dropped = e.dataTransfer.files[0]
  if (dropped?.type === 'application/pdf') selectFile(dropped)
}

function handleFileInput(e) {
  if (e.target.files[0]) selectFile(e.target.files[0])
}

async function selectFile(f) {
  file.value = f
  preview.value = null
  error.value = null
  success.value = null
  needsPassword.value = false
  await parseFile()
}

function isPasswordError(msg) {
  return /password|encrypted|no password/i.test(msg)
}

async function parseFile() {
  if (!file.value) return
  parsing.value = true
  error.value = null
  try {
    const fd = new FormData()
    fd.append('file', file.value)
    if (password.value) fd.append('password', password.value)
    preview.value = await statementsApi.parse(fd)
    needsPassword.value = false
  } catch (e) {
    const msg = e.response?.data?.error || e.message
    if (isPasswordError(msg)) {
      needsPassword.value = true
      error.value = 'This PDF is password-protected. Enter the password below.'
    } else {
      error.value = msg
    }
  } finally {
    parsing.value = false
  }
}

async function upload() {
  if (!selectedCardId.value) { error.value = 'Please select a card'; return }
  if (!file.value) { error.value = 'Please select a PDF file'; return }

  uploading.value = true
  error.value = null
  success.value = null
  try {
    const fd = new FormData()
    fd.append('card_id', selectedCardId.value)
    fd.append('file', file.value)
    if (password.value) fd.append('password', password.value)
    const result = await statementsApi.upload(fd)
    success.value = `Statement imported: ${result.transactionCount} transactions loaded`
    file.value = null
    preview.value = null
    password.value = ''
    needsPassword.value = false
    setTimeout(() => router.push(`/cards/${selectedCardId.value}`), 1500)
  } catch (e) {
    error.value = e.response?.data?.error || e.message
  } finally {
    uploading.value = false
  }
}

function reset() {
  file.value = null
  preview.value = null
  error.value = null
  success.value = null
  password.value = ''
  needsPassword.value = false
}

onMounted(async () => {
  await cardsStore.fetchCards()
  if (route.query.card_id) selectedCardId.value = String(route.query.card_id)
})
</script>

<template>
  <div class="max-w-2xl mx-auto">
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-white">Upload statement</h1>
      <p class="text-slate-400 text-sm mt-1">Upload a PDF to automatically extract transactions</p>
    </div>

    <!-- Card selector -->
    <div class="bg-slate-800 rounded-xl border border-slate-700 p-5 mb-5">
      <label class="text-slate-400 text-sm block mb-2">Credit card</label>
      <select
        v-model="selectedCardId"
        class="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
      >
        <option value="">Select a card...</option>
        <option v-for="c in cardsStore.cards" :key="c.id" :value="c.id">
          {{ c.alias }} ({{ c.bank.toUpperCase() }}<template v-if="c.last4"> •••• {{ c.last4 }}</template>)
        </option>
      </select>
      <div v-if="!cardsStore.cards.length" class="mt-2 text-slate-500 text-xs">
        No cards yet. <RouterLink to="/" class="text-indigo-400 hover:underline">Add one first</RouterLink>.
      </div>
    </div>

    <!-- Drop zone -->
    <div
      class="border-2 border-dashed rounded-xl p-10 text-center transition-colors mb-5"
      :class="dragOver
        ? 'border-indigo-400 bg-indigo-900/20'
        : file
          ? 'border-green-600 bg-green-900/10'
          : 'border-slate-700 hover:border-slate-600'"
      @dragover.prevent="dragOver = true"
      @dragleave="dragOver = false"
      @drop.prevent="handleDrop"
    >
      <div v-if="!file">
        <div class="text-4xl mb-3">📄</div>
        <p class="text-slate-300 font-medium mb-1">Drag your PDF here</p>
        <p class="text-slate-500 text-sm mb-4">or select a file</p>
        <label class="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm cursor-pointer transition-colors">
          Browse file
          <input type="file" accept="application/pdf" class="hidden" @change="handleFileInput" />
        </label>
      </div>
      <div v-else class="flex items-center justify-center gap-3">
        <span class="text-green-400 text-2xl">✓</span>
        <div class="text-left">
          <p class="text-white font-medium text-sm">{{ file.name }}</p>
          <p class="text-slate-500 text-xs">{{ (file.size / 1024).toFixed(1) }} KB</p>
        </div>
        <button @click="reset" class="ml-4 text-slate-500 hover:text-red-400 transition-colors text-sm">✕</button>
      </div>
    </div>

    <!-- Password field (shown when needed or file selected) -->
    <div v-if="file" class="bg-slate-800 rounded-xl border p-5 mb-5 transition-colors"
      :class="needsPassword ? 'border-yellow-600' : 'border-slate-700'">
      <div class="flex items-center gap-3">
        <div class="flex-1">
          <label class="text-slate-400 text-sm block mb-1">
            PDF password
            <span v-if="!needsPassword" class="text-slate-600 ml-1">(optional)</span>
            <span v-else class="text-yellow-400 ml-1">— required for this file</span>
          </label>
          <input
            v-model="password"
            type="password"
            placeholder="Leave empty if not protected"
            class="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            @keyup.enter="parseFile"
          />
        </div>
        <button
          v-if="password || needsPassword"
          @click="parseFile"
          :disabled="parsing"
          class="mt-5 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors disabled:opacity-40"
        >
          {{ parsing ? '...' : 'Parse' }}
        </button>
      </div>
    </div>

    <!-- Parse preview -->
    <div v-if="parsing" class="bg-slate-800 rounded-xl border border-slate-700 p-5 mb-5">
      <p class="text-slate-400 text-sm">Analyzing PDF...</p>
    </div>

    <div v-else-if="preview" class="bg-slate-800 rounded-xl border border-slate-700 p-5 mb-5">
      <div class="flex items-center gap-2 mb-4">
        <span class="text-green-400 font-medium text-sm">Bank detected:</span>
        <span class="text-white font-semibold text-sm uppercase">{{ preview.bank }}</span>
      </div>

      <div v-if="preview.error" class="text-orange-400 text-sm mb-3 bg-orange-900/20 rounded p-3">
        ⚠️ {{ preview.error }}
      </div>

      <div v-if="preview.period" class="grid grid-cols-3 gap-4 mb-4 text-sm">
        <div>
          <div class="text-slate-500 text-xs">Period</div>
          <div class="text-white">{{ MONTHS[(preview.period.month - 1)] }} {{ preview.period.year }}</div>
        </div>
        <div>
          <div class="text-slate-500 text-xs">Total balance</div>
          <div class="text-red-400 font-semibold">{{ fmt(preview.summary?.totalBalance) }}</div>
        </div>
        <div>
          <div class="text-slate-500 text-xs">Min. payment</div>
          <div class="text-white">{{ fmt(preview.summary?.minimumPayment) }}</div>
        </div>
      </div>

      <div v-if="preview.transactions?.length" class="border-t border-slate-700 pt-4">
        <div class="flex justify-between items-center mb-2">
          <span class="text-slate-400 text-xs font-semibold uppercase tracking-wide">
            {{ preview.transactions.length }} transactions found
          </span>
          <div class="flex gap-3 text-xs text-slate-500">
            <span><span class="text-red-400">●</span> {{ preview.transactions.filter(t => t.type === 'charge').length }} charges</span>
            <span><span class="text-orange-400">●</span> {{ preview.transactions.filter(t => t.type === 'msi').length }} MSI</span>
            <span><span class="text-green-400">●</span> {{ preview.transactions.filter(t => t.type === 'payment').length }} payments</span>
          </div>
        </div>
        <div class="max-h-48 overflow-y-auto space-y-1">
          <div
            v-for="(tx, i) in preview.transactions.slice(0, 20)"
            :key="i"
            class="flex justify-between text-xs py-1 px-2 rounded"
          >
            <span class="text-slate-400 truncate max-w-xs">{{ tx.description || '—' }}</span>
            <span :class="{
              'text-red-400': tx.type === 'charge',
              'text-orange-400': tx.type === 'msi',
              'text-green-400': tx.type === 'payment',
            }">
              {{ fmt(Math.abs(tx.amount)) }}
            </span>
          </div>
          <div v-if="preview.transactions.length > 20" class="text-slate-500 text-xs text-center pt-1">
            ... and {{ preview.transactions.length - 20 }} more
          </div>
        </div>
      </div>

      <div v-else class="text-slate-500 text-sm mt-2">
        No transactions found. The PDF format may need adjustments in the parser.
      </div>
    </div>

    <!-- Errors / success -->
    <div v-if="error" class="bg-red-900/30 border border-red-700 text-red-300 rounded-lg p-3 text-sm mb-4">
      {{ error }}
    </div>
    <div v-if="success" class="bg-green-900/30 border border-green-700 text-green-300 rounded-lg p-3 text-sm mb-4">
      {{ success }}
    </div>

    <!-- Actions -->
    <div class="flex gap-3">
      <RouterLink
        to="/"
        class="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors"
      >
        Cancel
      </RouterLink>
      <button
        @click="upload"
        :disabled="uploading || !file || !selectedCardId || needsPassword && !password"
        class="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
      >
        {{ uploading ? 'Importing...' : 'Import statement' }}
      </button>
    </div>
  </div>
</template>
