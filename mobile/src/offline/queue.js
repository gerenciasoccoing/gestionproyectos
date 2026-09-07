import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { progressApi, expensesApi } from '../api';

const QUEUE_KEY = 'pendingSubmissions';

async function readQueue() {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function writeQueue(queue) {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function getQueue() {
  return readQueue();
}

function buildFormData(entry) {
  const fd = new FormData();
  Object.entries(entry.fields || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') fd.append(key, String(value));
  });
  (entry.photos || []).forEach((photo) => {
    fd.append(entry.photosField, { uri: photo.uri, name: photo.name, type: photo.type });
  });
  Object.entries(entry.singleFiles || {}).forEach(([field, file]) => {
    if (file) fd.append(field, { uri: file.uri, name: file.name, type: file.type });
  });
  return fd;
}

async function submitEntry(entry) {
  const formData = buildFormData(entry);
  if (entry.kind === 'progress') return progressApi.createEntry(entry.projectId, entry.itemId, formData);
  if (entry.kind === 'expense') return expensesApi.create(entry.projectId, formData);
  throw new Error(`Tipo de envío pendiente desconocido: ${entry.kind}`);
}

// Encola un registro para enviarlo más tarde (sin conexión ahora mismo). Las fotos se referencian
// por su URI local — expo-image-picker deja esas URIs estables en el sandbox de la app mientras no
// se desinstale, tiempo de sobra para sincronizar. No se copia ni se sube el archivo todavía.
export async function enqueue(entry) {
  const queue = await readQueue();
  const withId = { ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, createdAt: new Date().toISOString() };
  queue.push(withId);
  await writeQueue(queue);
  return withId;
}

export async function removeFromQueue(id) {
  const queue = await readQueue();
  await writeQueue(queue.filter((e) => e.id !== id));
}

// Procesa la cola EN ORDEN (no en paralelo: son formularios con fotos desde el celular, no vale la
// pena saturar la red en campo) y se detiene en el primer error para no perder de vista qué quedó
// pendiente — ese y los siguientes se quedan en la cola tal cual, listos para la próxima sincronización.
export async function flushQueue() {
  const queue = await readQueue();
  let succeeded = 0;
  for (const entry of queue) {
    try {
      await submitEntry(entry);
      await removeFromQueue(entry.id);
      succeeded += 1;
    } catch (err) {
      return { succeeded, remaining: (await readQueue()).length, error: err };
    }
  }
  return { succeeded, remaining: 0, error: null };
}

// Dispara flushQueue automáticamente apenas vuelve la conexión (transición de sin-red a con-red),
// sin hacer polling — usa el propio listener de NetInfo. Devuelve la función para des-suscribirse.
export function subscribeAutoSync(onResult) {
  let wasConnected = null;
  return NetInfo.addEventListener((state) => {
    const isConnected = Boolean(state.isConnected && state.isInternetReachable !== false);
    if (isConnected && wasConnected === false) {
      flushQueue().then(onResult).catch(() => {});
    }
    wasConnected = isConnected;
  });
}
