# Finanzas · app para iPhone

Tu app de finanzas como app instalable (PWA): pantalla completa, icono propio, funciona sin conexión, con vibraciones, avisos, notificaciones y Face ID.

## Privacidad

- **Tus datos nunca salen del iPhone.** No hay servidor, cuenta ni base de datos: todo se guarda en el almacenamiento local de la app.
- La web solo aloja el *código*, que no contiene ningún dato tuyo ni ninguna clave.
- Tus claves de API (Anthropic y Alpha Vantage) se guardan solo en el iPhone y únicamente se envían a esos servicios.
- La página está marcada para que los buscadores no la indexen.
- Con PIN activado: Face ID para abrir, la app se vuelve a bloquear tras 1 minuto en segundo plano y los importes quedan ocultos en el selector de apps.

## Publicarla (una vez, unos 5 minutos, gratis)

1. Crea una cuenta en <https://github.com> (si no tienes).
2. Pulsa **New repository**. Ponle un nombre poco obvio (por ejemplo `fz-7k2q`) y elige **Public**.
   *(Los repositorios privados también sirven, pero publicar con Pages desde uno privado requiere GitHub Pro. Al ser público, el código es visible, pero tus datos no están ahí.)*
3. En el repositorio, pulsa **Add file → Upload files** y arrastra **todo el contenido** de esta carpeta (`index.html`, `native.js`, `native.css`, `sw.js`, `manifest.webmanifest`, `robots.txt` y la carpeta `icons`). Pulsa **Commit changes**.
4. Ve a **Settings → Pages**. En *Branch* elige `main` y la carpeta `/ (root)`, y pulsa **Save**.
5. Espera 1 o 2 minutos. Tu dirección será `https://TU-USUARIO.github.io/fz-7k2q/`.

## Instalarla en el iPhone

1. Abre esa dirección en **Safari** (tiene que ser Safari).
2. Toca **Compartir ⬆︎** y luego **Añadir a pantalla de inicio** → **Añadir**.
3. Ábrela **siempre desde el icono**. Los datos de la app instalada y los de Safari están separados.

## Pasar tus datos desde Claude

1. En el artefacto de Claude: **Más › Ajustes › Copia de seguridad › ↓ Backup .json**. Guárdalo en Archivos o iCloud Drive.
2. En la app instalada: **Más › Ajustes › Copia de seguridad › ↑ Importar** y elige ese archivo.

## Primera configuración (en la app: Más › Ajustes)

- **Conexiones**
  - *Asesor IA y lectura de tickets*: pega una clave de <https://console.anthropic.com/settings/keys>. Usa Claude Opus 5.5; cada consulta se cobra en tu cuenta de Anthropic (unos céntimos). Tiene activado el respaldo automático de modelo: si Claude declinara una consulta, la API la reintenta con otro modelo.
  - *Precios de bolsa*: clave gratuita de <https://www.alphavantage.co/support/#api-key> (25 consultas al día).
  - *Cripto y divisas*: funcionan solas (Crypto.com y Banco Central Europeo).
- **Avisos y vibración**: activa **Notificaciones del sistema** (solo funciona con la app ya instalada; requiere iOS 16.4 o posterior).
- **Bloqueo con PIN**: ponlo y activa **Desbloquear con Face ID**.

## Qué hace cada cosa nueva

| | |
|---|---|
| **Vibración** | Toque suave en cada botón, doble toque al guardar, triple al fallar el PIN (iPhone con iOS 18 o posterior). |
| **Animaciones** | Pantalla de arranque, iconos que rebotan, confirmación animada al guardar, avisos que caen desde arriba, confeti al alcanzar metas o saldar deudas, PIN que tiembla. |
| **Avisos** | Límite de gasto al 80 % y al 100 %, meta de patrimonio o de ahorro alcanzada, cobros que vencen hoy o están vencidos, recurrentes del mes registrados, recordatorio de copia de seguridad cada 30 días y recordatorio nocturno si no has apuntado nada. |
| **Icono** | El icono muestra un número con lo que requiere atención (límites superados y cobros vencidos). |

Limitación de iOS: sin un servidor, las notificaciones solo se generan mientras la app está abierta o al abrirla, no a una hora fija con la app cerrada.

## Actualizar la app

Sustituye los archivos en GitHub (**Add file → Upload files**). La app descarga la versión nueva sola la próxima vez que la abras con internet. Tus datos no se tocan.
