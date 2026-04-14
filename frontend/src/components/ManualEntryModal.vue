<script setup>
import { ref } from 'vue'
import { manualEntriesApi } from '../api/index.js'

const props = defineProps({
  cardId: { type: Number, required: true },
  year: { type: Number, required: true },
  month: { type: Number, required: true },
})
const emit = defineEmits(['close', 'saved'])

const form = ref({
  type: 'payment',
  amount: '',
  description: '',
})
const saving = ref(false)
const error = ref(null)

async function save() {
  if (!form.value.amount) {
    error.value = 'Amount is required'
    return
  }
  const rawAmount = parseFloat(form.value.amount)
  // payment = negative, charge = positive
  const amount = form.value.type === 'payment' ? -Math.abs(rawAmount) : Math.abs(rawAmount)

  saving.value = true
  error.value = null
  try {
    await manualEntriesApi.create({
      card_id: props.cardId,
      year: props.year,
      month: props.month,
      amount,
      description: form.value.description.trim() || null,
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
    <div class="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-sm p-6">
      <h2 class="text-white font-semibold text-lg mb-5">Manual entry</h2>
      <p class="text-slate-500 text-xs mb-4">
        Automatically removed when the real statement for this month is uploaded.
      </p>

      <div class="space-y-4">
        <div>
          <label class="text-slate-400 text-sm block mb-1">Type</label>
          <div class="flex gap-2">
            <button
              @click="form.type = 'payment'"
              class="flex-1 py-2 rounded-lg text-sm transition-colors"
              :class="form.type === 'payment'
                ? 'bg-green-600 text-white'
                : 'bg-slate-700 text-slate-400 hover:bg-slate-600'"
            >
              Payment
            </button>
            <button
              @click="form.type = 'charge'"
              class="flex-1 py-2 rounded-lg text-sm transition-colors"
              :class="form.type === 'charge'
                ? 'bg-red-600 text-white'
                : 'bg-slate-700 text-slate-400 hover:bg-slate-600'"
            >
              Charge
            </button>
          </div>
        </div>

        <div>
          <label class="text-slate-400 text-sm block mb-1">Amount (MXN)</label>
          <input
            v-model="form.amount"
            type="number"
            step="0.01"
            min="0"
            placeholder="500.00"
            class="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <label class="text-slate-400 text-sm block mb-1">Description (optional)</label>
          <input
            v-model="form.description"
            placeholder="e.g. Partial payment"
            class="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
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
