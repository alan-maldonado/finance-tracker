<script setup>
import { ref } from 'vue'
import { useCardsStore } from '../stores/cards.js'
import { useProfileStore } from '../stores/profile.js'

const emit = defineEmits(['close', 'saved'])
const store = useCardsStore()
const profileStore = useProfileStore()

const form = ref({
  bank: 'bbva',
  alias: '',
  last4: '',
  credit_limit: '',
  color: '#6366f1',
})
const saving = ref(false)
const error = ref(null)

const BANKS = [
  { value: 'bbva', label: 'BBVA' },
  { value: 'banamex', label: 'Banamex' },
  { value: 'santander', label: 'Santander' },
  { value: 'other', label: 'Other' },
]

const COLORS = [
  '#6366f1','#818cf8','#a78bfa','#8b5cf6','#c084fc','#d946ef','#ec4899','#f43f5e','#ef4444','#fb923c','#f59e0b',
  '#3b82f6','#60a5fa','#38bdf8','#06b6d4','#14b8a6','#10b981','#34d399','#4ade80','#84cc16','#a3e635','#facc15',
  '#1e3a5f','#1e40af','#1d4ed8','#2563eb','#0369a1','#0f766e','#065f46','#166534','#374151','#64748b','#94a3b8',
]

async function save() {
  if (!form.value.alias.trim()) {
    error.value = 'Alias is required'
    return
  }
  saving.value = true
  error.value = null
  try {
    await store.createCard({
      bank: form.value.bank,
      alias: form.value.alias.trim(),
      last4: form.value.last4 || null,
      credit_limit: form.value.credit_limit ? parseFloat(form.value.credit_limit) : null,
      color: form.value.color,
      profile_id: profileStore.activeProfileId,
    })
    emit('saved')
  } catch (e) {
    error.value = e.response?.data?.error || e.message
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" @click.self="emit('close')">
    <div class="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-md p-6">
      <h2 class="text-white font-semibold text-lg mb-5">New card</h2>

      <div class="space-y-4">
        <div>
          <label class="text-slate-400 text-sm block mb-1">Bank</label>
          <select v-model="form.bank" class="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm">
            <option v-for="b in BANKS" :key="b.value" :value="b.value">{{ b.label }}</option>
          </select>
        </div>

        <div>
          <label class="text-slate-400 text-sm block mb-1">Alias <span class="text-red-400">*</span></label>
          <input
            v-model="form.alias"
            placeholder="e.g. BBVA Blue"
            class="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-slate-400 text-sm block mb-1">Last 4 digits</label>
            <input
              v-model="form.last4"
              maxlength="4"
              placeholder="1234"
              class="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label class="text-slate-400 text-sm block mb-1">Credit limit</label>
            <input
              v-model="form.credit_limit"
              type="number"
              placeholder="50000"
              class="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div>
          <label class="text-slate-400 text-sm block mb-2">Color</label>
          <div class="grid grid-cols-11 gap-1.5">
            <button
              v-for="c in COLORS"
              :key="c"
              @click="form.color = c"
              class="w-7 h-7 rounded-full border-2 transition-all"
              :class="form.color === c ? 'border-white scale-110' : 'border-transparent'"
              :style="{ backgroundColor: c }"
            ></button>
          </div>
        </div>
      </div>

      <div v-if="error" class="mt-3 text-red-400 text-sm">{{ error }}</div>

      <div class="flex gap-3 mt-6">
        <button
          @click="emit('close')"
          class="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors"
        >
          Cancel
        </button>
        <button
          @click="save"
          :disabled="saving"
          class="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm transition-colors disabled:opacity-50"
        >
          {{ saving ? 'Saving...' : 'Save' }}
        </button>
      </div>
    </div>
  </div>
</template>
