# ERGY Project — App móvil

App complementaria a la web de ERGY-PROJECT (React Native + Expo). Consume el **mismo backend**
que la web (mismo login, mismos permisos, misma base de datos) — no existe ningún backend ni
modelo de datos aparte para el celular.

Alcance exclusivo de esta app (ver [TAREA CONCRETA] original): login, ver solo los proyectos
asignados al usuario, registrar avances de obra con foto, registrar gastos con foto de
factura/comprobante. Ningún otro módulo de ERGY-PROJECT (Cotizaciones, Presupuesto completo,
Personal, Órdenes de Compra, Administración, Base de Precios/APU) está expuesto aquí.

## 1. Requisitos

- Node.js 20+ y npm.
- Cuenta [Expo](https://expo.dev) (gratuita) — `npm install -g eas-cli` y `eas login`.
- Para publicar de verdad en las tiendas:
  - Cuenta **Apple Developer Program** (99 USD/año) — necesaria para App Store.
  - Cuenta **Google Play Console** (25 USD pago único) — necesaria para Play Store.

## 2. Ruta rápida: bajar un .apk instalable directo (sin Expo Go, sin tienda)

Es la forma más simple de probarla en un celular Android real: EAS compila en la nube y te da un
link de descarga directo del `.apk` — no necesita Expo Go, no necesita Play Store, no necesita
esperar ninguna revisión (eso solo aplica al enviar a la tienda, ver sección 6).

```bash
cd mobile
npm install -g eas-cli
eas login                    # con tu cuenta de expo.dev (gratis, créala si no tienes)
eas build:configure          # solo la primera vez: crea/confirma el project id de Expo
eas build --platform android --profile preview
```

Al terminar (unos 10-15 min, se ve el progreso en la terminal y en expo.dev), el comando imprime
un link `https://expo.dev/artifacts/...`. Ábrelo desde el navegador del celular (o pásaselo por
WhatsApp) y descarga el `.apk` — Android va a pedir permitir "instalar apps de origen
desconocido" la primera vez, es normal para un `.apk` fuera de Play Store.

Este comando **no se puede correr desde este chat**: `eas build`/`eas login` necesitan tu cuenta de
Expo y salir a `api.expo.dev`, y el entorno donde corre esta conversación tiene ese dominio
bloqueado por política de red (confirmado). Tienes que ejecutarlo tú, desde tu computador o desde
el servidor de producción — cualquiera con internet normal sirve, ninguno necesita estar cerca del
celular (el link de descarga funciona desde cualquier lado).

## 3. Probarla con Expo Go (alternativa más rápida para iterar mientras desarrollas)

```bash
cd mobile
npm install
cp .env.example .env
# Edita .env si tu backend no corre en https://ergyproject.com/api (ej. para probar contra local)
npx expo start
```

Escanea el código QR con la app **Expo Go** (Android/iOS) para probar en tu celular sin compilar
nada todavía. `EXPO_PUBLIC_API_URL` es la única variable de entorno — Expo la inyecta
automáticamente en el bundle al iniciar (no requiere ninguna librería extra).

## 4. Antes de compilar para las tiendas (una sola vez)

1. **Bundle identifier**: `app.json` trae `com.soccoing.ergyproject` como valor de referencia para
   `ios.bundleIdentifier` y `android.package`. **Decide el definitivo antes del primer build** — no
   se puede cambiar después sin volver a crear la ficha de la app en cada tienda.
2. **Ícono y splash**: `assets/icon.png`, `assets/adaptive-icon.png` y `assets/splash.png` son
   placeholders generados automáticamente (fondo azul, "EP"). Reemplázalos por el arte real de
   SOCCOING antes de publicar (1024×1024 para `icon.png`, fondo transparente para
   `adaptive-icon.png`).
3. **Política de privacidad**: ambas tiendas la exigen porque la app pide permiso de cámara/galería.
   Necesitas una URL pública (puede alojarse en `ergyproject.com`) que explique qué datos se
   capturan (fotos de avance y de facturas/comprobantes) y que se usan solo dentro de la empresa.
   Agrégala en el Play Console y en App Store Connect al crear la ficha de la app.
4. **Capturas de pantalla** para las fichas de ambas tiendas (se toman corriendo la app, no forman
   parte de este build).

## 5. EAS Build para las tiendas (.aab / .ipa)

El `.apk` de la sección 2 es solo para instalar directo en un celular de prueba — las tiendas NO
aceptan `.apk`, piden `.aab` (Android) e `.ipa` (iOS):

```bash
cd mobile
eas build --platform android --profile production  # .aab para subir a Play Store
eas build --platform ios --profile production       # .ipa para subir a App Store (EAS gestiona
                                                      # certificados/perfiles automáticamente si
                                                      # respondes "sí" cuando lo pregunte)
```

`eas.json` ya trae los tres perfiles (`development`, `preview`, `production`) con
`EXPO_PUBLIC_API_URL` apuntando a producción (`https://ergyproject.com/api`).

## 6. EAS Submit (envío a cada tienda)

```bash
eas submit --platform android   # sube el .aab a Google Play (pide la cuenta de servicio la 1ª vez)
eas submit --platform ios       # sube el .ipa a App Store Connect (pide tu Apple ID/app-specific password)
```

Después del primer envío, cada tienda revisa la app (Google: horas; Apple: 1–3 días típico) antes
de quedar disponible.

## 7. Cómo funciona el modo sin conexión

Si al guardar un avance o un gasto no hay señal, el registro (datos + fotos, referenciadas por su
ruta local en el celular) se guarda en el propio dispositivo (`src/offline/queue.js`) y la app lo
reintenta automáticamente apenas detecta conexión de nuevo — sin que el usuario tenga que hacer
nada. La lista de proyectos muestra cuántos registros quedan pendientes por sincronizar.

## 8. Qué NO hace falta tocar

- El backend no necesita ningún endpoint nuevo: la app reutiliza exactamente los mismos que la web
  (`/auth/login`, `/auth/me`, `/projects`, `/projects/:id/budget`,
  `/projects/:id/progress/items/:itemId/entries`, `/cash-boxes`, `/projects/:id/expenses`).
- Los permisos y la asignación de proyectos por usuario se resuelven en el backend, igual que en la
  web — esta app solo lee `user.permissions`/`user.roles` para decidir qué botones mostrar.
