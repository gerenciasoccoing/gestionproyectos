import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mismo backend/API que la web (frontend/src/api/client.js): mismos endpoints, mismo contrato de
// token/permisos — no existe ningún backend "para móvil" aparte.
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000/api';

const client = axios.create({ baseURL: API_URL });

client.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// A diferencia de la web (que puede redirigir sincrónicamente con window.location), acá el 401
// solo limpia la sesión guardada; es AuthContext quien nota el cambio (ver checkStoredSession) y
// navega a Login — no hay un manejo de navegación global fuera de React aquí.
let onSessionExpired = null;
export function setOnSessionExpired(fn) {
  onSessionExpired = fn;
}

client.interceptors.response.use(
  (res) => res,
  async (err) => {
    const hadSessionToken = Boolean(err.config?.headers?.Authorization);
    if (err.response?.status === 401 && hadSessionToken) {
      await AsyncStorage.multiRemove(['token', 'user']);
      if (onSessionExpired) onSessionExpired();
    }
    return Promise.reject(err);
  }
);

export default client;
export { API_URL };

// Extrae un mensaje legible de un error de axios (igual que frontend/src/components/ui.jsx#extractError).
export function extractError(err) {
  return err?.response?.data?.message || err?.message || 'Ocurrió un error inesperado';
}
