# Handoff: Rediseño Kanban DGTAR

## Resumen

Rediseño visual y funcional completo de **jhquihuiri7/kanban-dgtar** (Next.js + React + Tailwind).
Cubre las cinco superficies del producto — cabecera/navegación, Tablero (columnas, semana, mes),
Estadísticas, Catálogos y Usuarios — más los cuatro diálogos (detalle, nueva actividad, exportar,
nuevo/editar funcionario, nombre de catálogo).

Además del rediseño visual, el prototipo resuelve varios comportamientos que hoy faltan o no funcionan
en la aplicación: menú de perfil con cerrar sesión, selector de rango en Estadísticas, cursor de mes en
el Tablero, Gantt plegable y los diálogos de catálogo.

## Sobre los archivos de este paquete

Los archivos `.dc.html` incluidos son **referencias de diseño creadas en HTML** — prototipos que muestran
la apariencia y el comportamiento deseados. **No son código de producción para copiar y pegar.**

La tarea es **recrear estos diseños dentro del entorno que ya existe en `kanban-dgtar`**: React 18 +
Next.js App Router, Tailwind CSS, los componentes de `components/ui.tsx` (`Button`, `Input`, `Select`,
`Label`, `Badge`, `Icon`, `useClickAway`) y los tipos de `lib/data.ts`. Mantén los patrones actuales:
`"use client"`, `useState`/`useMemo`, `cn()` para componer clases, y el flujo de datos vía `useServerSync`.

Para abrir los prototipos: cualquier navegador moderno, sin servidor. `support.js` debe estar junto a los
`.dc.html`.

## Fidelidad

**Alta fidelidad (hi-fi).** Colores, tipografía, espaciados, radios, sombras y estados de interacción son
definitivos. Recrea la UI de forma pixel-perfect usando Tailwind; todos los valores están en la sección
*Design tokens* y en cada pantalla.

---

## Mapa de archivos: qué tocar en el repositorio

| Archivo del repo | Qué cambia |
| --- | --- |
| `app/globals.css`, `app/layout.tsx` | Fuente Plus Jakarta Sans (400–800), fondo `#F4F4F6`, texto `#12121A`, `font-variant-numeric: tabular-nums` |
| `tailwind.config.ts` | Paleta nueva (ver tokens), `fontFamily.sans`, radios 10/11/14/16/20px |
| `app/page.tsx` → `Header` | Píldoras de navegación, buscador central controlado, menú de perfil con **Cerrar sesión**, botón Google como icono, eliminación de `SettingsMenu` |
| `app/page.tsx` → `KanbanScreen` | Cursor de mes, línea de resumen dinámica, sin fila de KPIs |
| `components/kanban.tsx` | Tarjetas nuevas (borde de estado a la izquierda), columnas con contador, estado vacío, filtro por mes |
| `components/calendar.tsx` | Semana y mes con la nueva tarjeta compacta, orden por urgencia, navegación real |
| `components/stats.tsx` | Selector de rango, 5 KPIs, Gantt plegable y proporcional, dona, Sankey generado desde el catálogo, ranking |
| `components/catalogs.tsx` | Árbol Gestión → Competencia → Entregable en dos paneles; diálogo de nombre único |
| `components/users.tsx` | Tabla fusionada con Funcionarios; diálogo único con datos + cuenta obligatoria |
| `components/detail.tsx` | Panel lateral 540px con modo lectura / edición |
| `components/new-activity.tsx` | Modal 720px, dos columnas |
| `components/export.tsx` | Modal 460px |
| `components/ui.tsx` | Ajuste de `Button`, `Input`, `Select`, `Badge` a los tokens nuevos |

---

## Design tokens

### Color

| Uso | Hex |
| --- | --- |
| Fondo de app | `#F4F4F6` |
| Fondo de columna kanban | `#EFEFF2` |
| Superficie / tarjeta | `#FFFFFF` |
| Superficie sutil (filas, zebra) | `#FAFAFB` |
| Borde | `#ECECEF` |
| Borde hover | `#DCDCE3` |
| Separador de tabla | `#F1F1F4` / `#F4F4F6` |
| Texto primario | `#12121A` |
| Texto secundario | `#4B4B57` / `#5B5B69` |
| Texto terciario | `#8A8A99` / `#9C9CAA` |
| Texto deshabilitado | `#C4C4CE` |
| Etiqueta uppercase | `#B4B4C2` |
| Primario (acciones) | `#12121A`, hover `#26262F` |
| Acento (selección, hoy, activo) | `#6D28D9` sobre `#F1EBFF` / `#F7F2FF`, borde `#DCC9FA` |
| Track de segmento | `#EDEDF1` |

### Estados de actividad

| Estado | Punto / barra | Fondo insignia | Texto insignia |
| --- | --- | --- | --- |
| Pendiente | `#A5A5B3` | `#F2F2F5` | `#5B5B69` |
| En progreso | `#3B82F6` | `#E9F1FE` | `#1D4ED8` |
| En revisión | `#F59E0B` | `#FEF4E2` | `#B45309` |
| Cumplida | `#10B981` | `#E7F8F1` | `#0B7A5A` |
| Fin superado | `#F43F5E` | `#FEECEF` | `#C81E45` |

### Gestiones (de `db/schema.sql`)

| Gestión | Punto | Fondo insignia | Texto insignia |
| --- | --- | --- | --- |
| DGTAR | `#0ea5e9` | `#EAF7FE` | `#0369A1` |
| Gestión Territorial | `#22c55e` | `#E9F9EF` | `#15803D` |
| G. y Saneamiento Ambiental | `#8b5cf6` | `#F3EEFE` | `#6D28D9` |
| Gestión de Riesgos | `#14b8a6` | `#E6F7F5` | `#0F766E` |

Avatares: `linear-gradient(135deg, <color>, <color oscuro>)` con las iniciales en blanco 700.
AC `#0ea5e9→#0284c7` · MV `#22c55e→#16a34a` · LN `#8b5cf6→#7c3aed` · KZ `#2563eb→#1d4ed8` ·
DO `#14b8a6→#0d9488` · PJ `#a855f7→#9333ea`.

### Tipografía

**Plus Jakarta Sans**, pesos 400/500/600/700/800. Cárgala con `next/font/google` en `app/layout.tsx`.
Números siempre con `tabular-nums`.

| Rol | Tamaño / peso / tracking |
| --- | --- |
| Título de pantalla | 23px / 800 / -0.03em |
| Cifra KPI | 30px / 800 / -0.035em |
| Título de sección (h2) | 16px / 750 / -0.02em |
| Subtítulo de sección | 12px / 500 |
| Título de tarjeta kanban | 13.5px / 650 / -0.01em, line-height 1.35 |
| Cuerpo de tabla | 13px / 400–650 |
| Etiqueta de formulario | 11.5px / 700 |
| Insignia | 10.5–11px / 700 |
| Etiqueta uppercase | 10px / 750 / 0.06em |
| Meta de tarjeta | 11px / 550 |

*Nota:* pesos como 650/750 requieren fuente variable — ya lo es. Con Tailwind usa `font-[650]`.

### Radios

Botón/insignia píldora `999px` · Botón cuadrado 10px · Input 11px · Tarjeta kanban 14px ·
KPI 16px · Sección 20px · Modal 22px.

### Sombras

- Tarjeta: `0 1px 2px rgba(18,18,26,.03)`
- Tarjeta hover: `0 4px 14px rgba(18,18,26,.07)`
- Botón primario: `0 2px 8px rgba(18,18,26,.22)`
- Popover: `0 14px 38px rgba(18,18,26,.16)`
- Modal: `0 24px 64px rgba(18,18,26,.24)`
- Anillo de avatar: `0 0 0 2px #fff, 0 0 0 3px #E9E9ED` (activo: `#6D28D9`)

### Espaciado

Lienzo 1500px máx., padding lateral 24px. Rejilla de columnas gap 14px, tarjetas gap 10px,
padding de tarjeta 13px 14px 12px 16px, padding de sección 20px, alto de fila de tabla 11px vertical.

---

## Pantallas

### 1. Cabecera (sticky, z-30)

Fondo `rgba(244,244,246,.86)` + `backdrop-filter: blur(14px)`, borde inferior `#E9E9ED`, padding 12px 24px.
De izquierda a derecha:

1. **Marca** — cuadro 38px radio 12px fondo `#12121A` con icono kanban blanco; a la derecha "Kanban DGTAR"
   14px/700 y "Dirección de Planificación" 10.5px/500 `#8A8A99`.
2. **Navegación** — píldoras dentro de un track `#EDEDF1` radio 999px padding 4px. Píldora activa:
   fondo `#F1EBFF`, texto `#6D28D9`, `box-shadow: 0 0 0 1px rgba(109,40,217,.18), 0 2px 10px rgba(109,40,217,.16)`.
   Inactiva: transparente, texto `#5B5B69`. Alto 32px, padding 0 15px, 13px/650. Catálogos y Usuarios
   solo si `isAdmin`.
3. **Buscador** — 38px alto, radio 999px, borde `#E9E9ED`, icono lupa 15px `#8A8A99`, input transparente
   13px, atajo "⌘ K" en píldora `#F2F2F5`. Con texto, el atajo se sustituye por un botón × que limpia.
   Comparte estado con el buscador del Tablero.
4. **Indicador de guardado** — píldora `#E7F8F1` / `#0B7A5A`, icono check, texto "Guardado".
   Mapea a `SyncIndicator` (`saving` / `saved` / `error`).
5. **Google Calendar** — botón circular 34px con icono calendario `#6D28D9` y punto verde 9px arriba a la
   derecha cuando está vinculado. Abre popover 292px: etiqueta "Google Calendar", insignia "Vinculado",
   email, "Última sincronización: …" y acciones **Sincronizar** / **Desvincular**.
   (`GoogleCalendarControl` — mantén los tres estados: cargando, sin vincular, vinculado/error.)
6. **Exportar** — píldora blanca con borde, icono download.
7. **Nueva actividad** — píldora `#12121A` con icono +.
8. **Avatar / perfil** — círculo 34px con iniciales. Al pulsarlo abre popover 262px con avatar 38px,
   nombre, email en monoespaciada, insignias de rol y gestión, separador y **Cerrar sesión** en `#C81E45`
   con icono log-out, hover `#FEECEF`. → `<form action="/api/auth/logout" method="post">` existente.

Todos los popovers se cierran con un overlay `position:fixed; inset:0; z-index:55` — en React usa el
`useClickAway` que ya tienes.

### 2. Tablero

**Encabezado**: título 23px/800 + línea de resumen "N actividades · **N** con fecha fin superada · **N** cumplidas",
calculada sobre el conjunto visible. A la derecha, segmento Columnas / Semana / Mes (track `#EDEDF1`,
activo blanco con sombra `0 1px 3px rgba(18,18,26,.10)`).

**Barra de filtros** (una fila, gap 10px, wrap):
- **Cursor de mes** — grupo blanco radio 999px: ‹ (26px) · etiqueta "Junio 2026" min-width 104px 12.5px/700 · › ·
  botón "Hoy" que se atenúa (`#C4C4CE`, sin fondo) cuando el desplazamiento es 0 y se vuelve `#F1EBFF`/`#6D28D9` si no.
- Buscador (borde `#DCC9FA` + halo `0 0 0 3px rgba(109,40,217,.10)` mientras hay texto).
- Píldora morada con el número de resultados, solo mientras se busca.
- Selects "Todos los funcionarios" / "Todas las competencias".
- Leyenda de colores a la derecha.

**Columnas** — rejilla de 4, gap 14px. Cabecera de columna: punto 8px del color del estado, nombre 13.5px/700,
contador en píldora `#E7E7EC`. Cuerpo: contenedor `#EFEFF2` radio 16px padding 10px, min-height 220px.

**Tarjeta**: blanca, radio 14px, borde `#ECECEF`, padding `13px 14px 12px 16px`, con barra vertical de 3px
a la izquierda con el color del semáforo. Contiene insignias (tipo Reunión + gestión), título 13.5px/650,
avatar 27px (más "+N" si hay participantes), y pie con fecha (icono calendario o reloj) e insignia de
plazo. Hover: borde `#DCDCE3` y sombra `0 4px 14px rgba(18,18,26,.07)`.

**Estado vacío de columna**: icono lupa + "Sin actividades este mes" (o "Sin coincidencias" al buscar).

### 3. Semana y Mes

Tarjeta blanca radio 20px padding 20px. Cabecera: rango ("15 – 21 junio 2026" o "Junio 2026"), píldora
morada de distancia ("en 1 semana", "hace 2 meses") que desaparece en el período actual, botones ‹ › y
"Hoy" con el mismo tratamiento atenuado.

**Semana**: 7 columnas. Cabecera de día `#F4F4F6` radio 11px (hoy: fondo `#12121A`, número blanco).
Cuerpo `#F7F7F9` radio 14px min-height 190px (hoy: `#F1EBFF`). Tarjetas compactas de 11.5px con barra de
3px, insignia y avatar 19px. Máximo 3 por día + enlace "+N más". Las reuniones se muestran en una tarjeta
morada `linear-gradient(135deg,#8B5CF6,#6D28D9)` con la tarjeta blanca dentro, hora y avatares apilados.

**Mes**: rejilla de 7, 35 o 42 celdas según el mes (¡calcula las filas, no las fijes!). Celda 104px min,
radio 13px; hoy con fondo `#F7F2FF`, borde `#DCC9FA` y número en círculo negro. Hasta 2 actividades por
celda con punto de color, más el total a la derecha.

**Orden dentro del día**: rojas → ámbar → slate → verdes; a igualdad, primero la que vence ese día y luego
la de fin más próximo.

### 4. Estadísticas

**Selector de rango** (el control clave): botón píldora con icono calendario, el rango formateado
("01 jun – 30 jun 2026") y chevron. Abre popover 320px con:
- `Desde` / `Hasta` (`input[type=date]`, 38px, radio 10px).
- Aviso morado si las fechas están invertidas: "Fechas invertidas: se aplica <rango ordenado>" — **no**
  bloquees el guardado; ordena el rango.
- Atajos en rejilla 2×3: Este mes, Mes anterior, Últimos 30 días, Últimos 90 días, Trimestre actual, Este año.
  El activo lleva fondo `#F7F2FF`, borde `#DCC9FA`, texto `#6D28D9`.
- Pie: "N días seleccionados" (singular "1 día seleccionado") y botón **Listo**.

Todo lo que sigue se recalcula desde ese rango — una actividad entra si su rango se solapa con el período.

**KPIs** (5 columnas): Totales, En progreso, Cumplidas, Fin superado, Finalizan pronto (≤ 3 días).
Cifra 30px/800 con color del estado; subtexto 11px `#9C9CAA`.

**Gantt** — tarjeta con tabla de dos columnas: 280px de etiquetas + pista proporcional.
- Cabecera: si el rango ≤ 31 días, una celda por día con su número; si es mayor, celdas por mes con
  `grid-column: span <días del mes>` sobre `repeat(<total días>, 1fr)` para que el ancho sea proporcional.
- Filas jerárquicas **plegables**: Gestión (fondo `#F4F4F6`) → Funcionario → una fila por actividad.
  Al pulsar una gestión se contraen sus funcionarios; al pulsar un funcionario, sus barras se sustituyen
  por tiras de 7px al 55% de opacidad para no perder su carga de vista. Chevron con `rotate(90deg)` y
  `transition: transform .18s`.
- Barras: alto 28px, radio 999px, color del estado, título dentro en 12px/650 con elipsis, recortadas
  al rango. Botón **Contraer todo / Expandir todo** en la cabecera.
- Banda de "hoy" `rgba(109,40,217,.07)` con bordes `rgba(109,40,217,.28)`, solo si hoy cae en el rango.
- Las actividades de cada funcionario van **ordenadas por fecha de inicio ascendente**.

**Dona** — SVG 120×120, `r=42`, `stroke-width=15`, circunferencia 263.89. Anillo de fondo `#F2F2F5` siempre
visible; cada segmento con `stroke-dasharray` proporcional (resta 3 para el hueco) y `stroke-dashoffset`
acumulado, `transform="rotate(-90 60 60)"`. Total y leyenda con conteos al lado.

**Sankey** — `viewBox="0 0 700 292"`. Tres columnas de nodos (x=150 gestión, x=350 competencia, x=520
entregable), ancho 10, radio 3. Enlaces como `<path>` con `stroke-width` igual al alto del destino y
`stroke-opacity=".26"`, curva cúbica con puntos de control a 255 y 440. **Genéralo desde el catálogo**,
no lo dibujes a mano: alto de nodo = nº de actividades × unidad, con separaciones de 12px. Como en tu
modelo una competencia pertenece a una sola gestión y un entregable a una sola competencia, los flujos
nunca se cruzan. Debajo, la lista de competencias del Estatuto con su conteo.

**Ranking por funcionario** — tabla con avatar, cargo, total, cumplidas, fin superado y barra de
cumplimiento (verde ≥100, ámbar ≥50, rojo por debajo). Oculta a quien no tiene actividades en el período.

**Estados vacíos**: los cuatro paneles (Gantt, dona, Sankey, ranking) muestran un recuadro punteado
`#FAFAFB` con borde `#E4E4E9` y el texto "Sin actividades en el período seleccionado". En el Gantt,
además, se ocultan la leyenda, el botón Contraer todo y la instrucción del subtítulo.

### 5. Catálogos

Dos paneles: **Gestiones** (320px) y el detalle de la seleccionada.
- Lista de gestiones: fila con punto de color, nombre 13px/700 y resumen "N competencias · N entregables".
  La activa lleva borde izquierdo `3px #6D28D9` y fondo `#F7F2FF`. Abajo, botón **Nueva gestión** a ancho completo.
- Detalle: cabecera con el nombre, botón editar y **Nueva competencia**. Luego una fila por competencia
  (chevron, código `C1` en píldora morada, nombre, resumen) que despliega sus entregables en una lista
  con guía punteada a la izquierda, cada uno con editar/borrar, y un botón punteado
  **+ Nuevo entregable en C1**.
- **Importante**: los botones de acción de la fila de competencia deben llamar `e.stopPropagation()`
  o quedarán plegando la fila al pulsarlos.

**Diálogo de nombre** (uno solo, reutilizado — equivale a tu `NameDialog`): 440px, un campo "Nombre"
obligatorio, guardar deshabilitado si está vacío. El subtítulo declara la posición en la jerarquía:
"Pertenecerá a DGTAR", "Pertenecerá a C1 · Seguimiento al Plan Galápagos", "C1 · DGTAR".

### 6. Usuarios

**Funcionarios y usuarios quedan fusionados en una sola tabla** — en el prototipo son la misma entidad:
todo funcionario tiene cuenta. Columnas: Funcionario (avatar 32px, nombre, cargo), Gestión (insignia),
Email (monoespaciada), Acceso (insignia Admin `#E9F1FE`/`#1D4ED8` o User `#F2F2F5`/`#5B5B69`) y Acciones.
La papelera de la propia cuenta va deshabilitada al 45%.

**Diálogo Nuevo / Editar funcionario** (600px), en dos bloques:
1. *Datos del funcionario* — Nombre (obligatorio, con asterisco), Cargo, Gestión (select), Email
   institucional (obligatorio; nota: "También es el correo con el que inicia sesión").
2. *Acceso a la plataforma* — bloque `#FAFAFB` con Rol (segmento User / Admin, con una línea que explica
   los permisos de cada uno) y Contraseña. La línea de contexto confirma el nombre visible tomándolo del
   campo de arriba.

Validación (igual que `UserDialog`): guardar deshabilitado sin nombre, sin email, o —al crear— con menos
de 8 caracteres de contraseña. El contador dice "Faltan N caracteres" y enrojece el borde. Al editar, la
etiqueta pasa a "Nueva contraseña" y aclara que vacía mantiene la actual.

### 7. Diálogos

- **Panel de detalle** — lateral derecho 540px, alto completo, sombra `-18px 0 48px rgba(18,18,26,.16)`.
  Cabecera sticky con insignias de gestión y estado. Modo lectura: título 19px/750, descripción,
  responsable, participantes, tres celdas de fechas (Creada / Inicio / Fin), aviso de plazo, competencia
  y entregable, historial y los tres campos de texto. Pie sticky: Cerrar · Eliminar · Editar · Marcar cumplida.
  Modo edición: mismos campos como formulario; pie Cancelar · Guardar cambios.
- **Nueva actividad** — modal 720px, segmento Asignación / Reunión, campos en dos columnas, lista de
  participantes con checkboxes (`accent-color: #12121A`).
- **Exportar** — modal 460px con Desde / Hasta y el conteo de actividades en el rango.

---

## Interacciones y estado

| Estado | Tipo | Notas |
| --- | --- | --- |
| `tab` | kanban / stats / catalogs / users | Ya existe |
| `view` | columns / week / month | Se reinicia `periodOffset` al cambiar |
| `boardOffset` | number | Desplazamiento de meses del Tablero |
| `periodOffset` | number | Desplazamiento de semanas/meses del calendario |
| `statsIni`, `statsFin` | ISO date | Rango de Estadísticas (por defecto, mes actual) |
| `query` | string | Compartido por los dos buscadores |
| `collapsed` | Record<string, true> | Nodos plegados del Gantt y del árbol de catálogos |
| `menu` | null / google / perfil / rango | Un solo popover abierto a la vez |
| `overlay` | null / detail / new / export / funcionario / nombre | Un solo modal a la vez |
| `gestionSel` | id | Gestión activa en Catálogos |

**Búsqueda**: normaliza con `.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")` y exige que
**todas** las palabras aparezcan en `título + gestión + responsable + iniciales`. Se aplica a columnas,
semana y mes.

**Regla de período del Tablero** (decisión de producto):
1. La actividad entra si su rango se solapa con el mes seleccionado.
2. Las **vencidas siguen visibles siempre**, aunque el mes no las contenga; llevan una etiqueta morada
   "de may" junto a la fecha.
3. La columna **Cumplida** queda estrictamente acotada al mes, para que no crezca sin límite.

**Transiciones**: `background .15s`, `color .15s` en píldoras; `transform .18s ease` en chevrones e
interruptores. Sin animaciones de entrada.

**Accesibilidad**: cada botón de icono lleva `aria-label`; los objetivos táctiles del prototipo son de
34px en escritorio — conserva tus clases `h-11` para móvil.

---

## Assets

Ninguna imagen. Los iconos son **lucide** dibujados inline (los mismos nombres que ya usa tu `Icon`:
kanban, chart, list, users, search, calendar, clock, download, plus, check, checkCircle, alert, edit,
trash, refresh, close, logout, filter, chevronLeft/Right/Down, zap, target, flame, fileText). La fuente
es Plus Jakarta Sans desde Google Fonts.

---

## Orden de implementación sugerido

1. **Tokens + shell**: fuente, colores, `Header` completo (incluido el menú de perfil con cerrar sesión).
2. **Tablero**: tarjetas, columnas, cursor de mes, búsqueda compartida.
3. **Calendario**: semana y mes con navegación real y orden por urgencia.
4. **Estadísticas**: selector de rango primero, luego KPIs, dona, ranking, Gantt y Sankey.
5. **Catálogos y Usuarios** con sus diálogos.
6. **Detalle, Nueva actividad, Exportar**.

## Archivos incluidos

| Archivo | Contenido |
| --- | --- |
| `Kanban DGTAR.dc.html` | Prototipo de escritorio: todas las pantallas y diálogos |
| `Kanban DGTAR Movil.dc.html` | Prototipo móvil: tablero, agenda, detalle y estadísticas |
| `support.js` | Runtime de los prototipos (no es código de producción) |
| `ios-frame.jsx` | Marco de iPhone usado solo por el prototipo móvil |
