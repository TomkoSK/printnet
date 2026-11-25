<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const devices = ref([])
const file = ref(null)
const deviceId = ref('')
const copies = ref(1)

const sending = ref(false)
const error = ref('')
const job = ref(null)

let timer = null

const statusText = {
  queued: 'Čaká v rade',
  printing: 'Tlačí sa',
  done: 'Hotovo',
  failed: 'Chyba',
  cancelled: 'Zrušené',
}

async function loadDevices() {
  try {
    const res = await fetch('/api/devices')
    devices.value = await res.json()
  } catch (e) {
    error.value = 'Nepodarilo sa načítať tlačiarne.'
  }
}

function onFileChange(event) {
  file.value = event.target.files[0]
}

async function sendJob() {
  error.value = ''
  job.value = null
  stopPolling()

  if (!file.value) {
    error.value = 'Vyber PDF súbor.'
    return
  }

  const form = new FormData()
  form.append('file', file.value)
  form.append('device_id', deviceId.value)
  form.append('copies', copies.value)

  sending.value = true
  try {
    const res = await fetch('/api/print', { method: 'POST', body: form })
    if (!res.ok) {
      error.value = await res.text()
      return
    }
    const data = await res.json()
    job.value = { id: data.id, status: data.status }
    startPolling()
  } catch (e) {
    error.value = 'Nepodarilo sa spojiť so serverom.'
  } finally {
    sending.value = false
  }
}

async function checkJob() {
  try {
    const res = await fetch('/api/jobs/' + job.value.id)
    if (!res.ok) return
    job.value = await res.json()

    if (job.value.status !== 'queued' && job.value.status !== 'printing') {
      stopPolling()
    }
  } catch (e) {
    // server je asi chvilu nedostupny, skusime znova pri dalsom intervale
  }
}

function startPolling() {
  timer = setInterval(checkJob, 2000)
}

function stopPolling() {
  clearInterval(timer)
  timer = null
}

onMounted(loadDevices)
onUnmounted(stopPolling)
</script>

<template>
  <main>
    <h1>PrintNet</h1>

    <form @submit.prevent="sendJob">
      <label>
        PDF súbor
        <input type="file" accept="application/pdf" @change="onFileChange" />
      </label>

      <label>
        Tlačiareň
        <select v-model="deviceId" required>
          <option value="" disabled>Vyber tlačiareň</option>
          <option v-for="device in devices" :key="device.id" :value="device.id">
            {{ device.name }} {{ device.online ? '(online)' : '(offline)' }}
          </option>
        </select>
      </label>

      <label>
        Počet kópií
        <input type="number" v-model="copies" min="1" max="100" />
      </label>

      <button type="submit" :disabled="sending">
        {{ sending ? 'Odosielam...' : 'Tlačiť' }}
      </button>
    </form>

    <p v-if="error" class="error">{{ error }}</p>

    <div v-if="job" class="job">
      <p>Úloha #{{ job.id }}</p>
      <p>Stav: <b :class="job.status">{{ statusText[job.status] || job.status }}</b></p>
      <p v-if="job.error" class="error">{{ job.error }}</p>
    </div>
  </main>
</template>
