# DentaCita · Manual técnico

Documentación de arquitectura, módulos y decisiones de seguridad del prototipo. Para el uso por rol, ver [MANUAL_USUARIO.md](MANUAL_USUARIO.md).

## 1. Arquitectura

DentaCita es una aplicación **100 % del lado del cliente**: HTML5, CSS3 y JavaScript puro, sin frameworks, librerías externas, servidor ni base de datos. Se publica como sitio estático en GitHub Pages.

```
Navegador
├── Páginas (HTML)         index · mfa · citas · panel-logs · simulador · pruebas
├── Módulos (js/*.js)      comun → validacion → logs → auth → mfa → simulador → pruebas
├── Datos de solo lectura  data/usuarios.json  (fetch)
└── Almacenamiento local
    ├── localStorage       dentacita_citas · dentacita_logs · dentacita_bloqueos
    └── sessionStorage     dentacita_sesion · dentacita_mfa_pendiente
```

Los scripts son clásicos (sin módulos ES): comparten el ámbito global, por lo que **el orden de carga importa** y es el mismo en todas las páginas: `comun.js`, `validacion.js`, `logs.js`, `auth.js` y, donde se necesita, `mfa.js`, `simulador.js` y `pruebas.js`.

## 2. Módulos

| Archivo | Responsabilidad | Funciones principales |
|---|---|---|
| `js/comun.js` | Constantes y utilidades compartidas | `generarId`, `esFueraDeHorario`, `formatearFecha`, `fechaDeHoy`, `mostrarMensajeFormulario`, `descargarArchivo` |
| `js/validacion.js` | Validación y saneamiento de entrada | `validarCorreo`, `validarContrasena`, `limpiarEspacios`, `escaparHTML`, `contieneCaracteresSospechosos` |
| `js/logs.js` | Registro de eventos, reglas de detección, alertas y filtros | `registrarEvento`, `obtenerEventos`, `evaluarReglasDeteccion`, `generarAlerta`, `obtenerAlertasActivas`, `marcarAlertaRevisada`, `filtrarEventos`, `borrarEventosSimulados` |
| `js/auth.js` | PBKDF2, bloqueo, sesión y control de acceso | `derivarHashPBKDF2`, `verificarContrasena`, `iniciarSesion`, `crearSesion`, `evaluarAcceso`, `verificarAcceso`, `paginaInicioPorRol`, `ROLES_POR_PAGINA` |
| `js/mfa.js` | MFA simulado | `rolRequiereMFA`, `generarCodigoMFA`, `iniciarDesafioMFA`, `verificarCodigoMFA`, `expirarDesafioSiVencido`, `cancelarDesafioMFA` |
| `js/simulador.js` | Cuatro escenarios de incidentes | `simularFuerzaBruta`, `simularAccesoFueraDeHorario`, `simularEscalamientoPrivilegios`, `simularEnumeracionCuentas` |
| `js/pruebas.js` | Casos de prueba, métricas y exportación | `ejecutarSuitePruebas`, `definirCasos`, `calcularMetricas`, `resultadosAJSON`, `resultadosACSV` |

Dependencias: `auth.js` usa `logs.js`, `validacion.js` y `comun.js`; `mfa.js` usa `auth.js` (`crearSesion`, `compararSeguro`) y `logs.js`; `simulador.js` y `pruebas.js` usan todos los anteriores.

## 3. Almacenamiento de contraseñas (PBKDF2)

Cada usuario de `data/usuarios.json` tiene:

```json
{
  "id": "REC001",
  "nombre": "Maria Fernanda Lopez",
  "correo": "recepcion@sonrisa.ec",
  "algoritmo": "PBKDF2-SHA256",
  "iteraciones": 150000,
  "sal": "8fb90636074c39a46dc7f15d50cf7594",
  "hashContrasena": "79f141a1…",
  "rol": "recepcionista"
}
```

- **Algoritmo:** PBKDF2 con HMAC-SHA-256 mediante `crypto.subtle.deriveBits`, 256 bits de salida.
- **Sal:** 16 bytes aleatorios **distintos por usuario**, en hexadecimal.
- **Iteraciones:** 150 000 (mínimo aceptado: 100 000; un registro con menos se rechaza).
- **Comparación:** `compararSeguro` recorre siempre toda la cadena (tiempo constante).
- **Correo inexistente:** se deriva igualmente con una sal señuelo y las mismas iteraciones, de modo que el tiempo de respuesta no revela si la cuenta existe.
- **SHA-256 simple:** `calcularHashSHA256` se conserva únicamente para que `pruebas.html` compare tiempos.

Para generar un usuario nuevo con Node.js:

```js
const c = require("crypto");
const sal = c.randomBytes(16).toString("hex");
const hash = c.pbkdf2Sync("Contraseña#2024", Buffer.from(sal, "hex"), 150000, 32, "sha256").toString("hex");
console.log({ algoritmo: "PBKDF2-SHA256", iteraciones: 150000, sal, hashContrasena: hash });
```

## 4. Flujo de autenticación con MFA

```
1. index.html: validarCorreo / validarContrasena (formato). Si falla, se muestra el error y termina.
2. iniciarSesion(correo, contraseña):
   a. ¿estaBloqueada(correo)?  → registra CUENTA_BLOQUEADA y responde "Cuenta bloqueada temporalmente".
   b. Carga usuarios.json y busca el correo.
   c. verificarContrasena: deriva PBKDF2 (siempre, exista o no el usuario).
   d. Incorrecta:
        intentos + 1; si llega a 3 → bloqueo de 5 min y CUENTA_BLOQUEADA;
        si no → LOGIN_FALLIDO. Mensaje genérico "Usuario o contraseña incorrectos".
   e. Correcta: reinicia el contador de intentos y decide según el rol:
        • paciente / odontólogo → crearSesion → LOGIN_EXITOSO (+ ACCESO_FUERA_HORARIO si aplica)
                                  → paginaInicioPorRol
        • administrador / recepcionista → iniciarDesafioMFA → MFA_ENVIADO (SIN sesión)
                                  → redirige a mfa.html
3. mfa.html (solo si hay desafío vigente; si no, vuelve a index.html):
   a. Muestra el código en el panel "Dispositivo simulado / Correo simulado" y la cuenta regresiva.
   b. Formato inválido (no son 6 dígitos): error local, NO consume intento.
   c. verificarCodigoMFA(codigo):
        • vencido (≥ 2 min)        → MFA_EXPIRADO, desafío descartado, sin sesión
        • coincide                 → desafío descartado → MFA_EXITOSO → crearSesion → LOGIN_EXITOSO
                                     → paginaInicioPorRol
        • no coincide, quedan > 0  → MFA_FALLIDO, intentosRestantes - 1
        • no coincide, quedan 0    → MFA_FALLIDO, desafío descartado, login cancelado
                                     (el 3.er MFA_FALLIDO dispara la alerta ALTO "Fallos de verificación MFA")
4. Páginas protegidas: verificarAcceso(ROLES_POR_PAGINA[página]) → evaluarAcceso:
        • sin sesión (incluye "MFA pendiente") → redirige a index.html, sin evento
        • rol no permitido → ACCESO_DENEGADO y redirige a la página de inicio de su rol
        • permitido → renderiza
```

**Garantías clave**
- La sesión (`dentacita_sesion`) **solo** se crea en `crearSesion`, que para los roles con MFA se invoca únicamente tras un código correcto. Mientras tanto existe solo `dentacita_mfa_pendiente`, que ninguna página protegida reconoce.
- El código se genera con `crypto.getRandomValues` y muestreo por rechazo (sin sesgo del módulo): 10⁶ valores equiprobables.
- El código **nunca** se escribe en el registro de eventos.
- Un desafío se consume al usarse: un código correcto no se puede reutilizar.

**Tabla `ROLES_POR_PAGINA`** (única fuente del control de acceso, usada por las páginas y por las pruebas):

| Página | Roles permitidos |
|---|---|
| `citas.html` | paciente, recepcionista, odontologo |
| `panel-logs.html` | administrador |
| `simulador.html` | administrador |
| `pruebas.html` | administrador |

## 5. Estructura del registro de eventos

Se guarda en `localStorage` bajo `dentacita_logs` como un arreglo JSON, en orden de registro.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | string | Identificador único (`EVT-<tiempo>-<aleatorio>`) |
| `fecha_hora` | string ISO 8601 | Momento del evento (UTC) |
| `usuario` | string | Correo, o `desconocido` / `sistema` |
| `rol` | string | `paciente`, `odontologo`, `recepcionista`, `administrador`, `desconocido` o `sistema` |
| `accion` | string | Una constante de `ACCIONES` (ver abajo) |
| `resultado` | string | `EXITO`, `FALLO` o `ALERTA` |
| `detalle` | string | Descripción breve, sin datos sensibles |
| `sesion_id` | string \| null | Id de la sesión activa; agrupa eventos de una misma sesión |

Campos opcionales:

| Campo | Aparece en | Significado |
|---|---|---|
| `nivel`, `regla`, `clave`, `evento_origen` | `ALERTA_SEGURIDAD` | Nivel (ALTO/MEDIO), regla que la generó, clave de deduplicación y evento que la disparó |
| `alerta_id` | `ALERTA_REVISADA` | Alerta que se marcó como revisada |
| `simulado`, `corrida` | Eventos del simulador | `true` y el id del escenario ejecutado |

Ejemplo:

```json
{
  "id": "EVT-mh3k2x9a-4f1c0b7d2e9a",
  "fecha_hora": "2026-10-30T14:57:14.887Z",
  "usuario": "admin@sonrisa.ec",
  "rol": "administrador",
  "accion": "MFA_FALLIDO",
  "resultado": "FALLO",
  "detalle": "Código MFA incorrecto; quedan 2 intento(s)",
  "sesion_id": null
}
```

**Acciones:** `LOGIN_EXITOSO`, `LOGIN_FALLIDO`, `CUENTA_BLOQUEADA`, `ACCESO_FUERA_HORARIO`, `ACCESO_DENEGADO`, `LOGOUT`, `CITA_CREADA`, `CITA_CANCELADA`, `MFA_ENVIADO`, `MFA_EXITOSO`, `MFA_FALLIDO`, `MFA_EXPIRADO`, `ALERTA_SEGURIDAD`, `ALERTA_REVISADA`, `LOG_EXPORTADO`, `LOG_SIMULADOS_BORRADOS`, `PRUEBAS_EJECUTADAS`.

**Integridad:** el módulo solo expone operaciones de agregar y leer. La única función de borrado es `borrarEventosSimulados`, que elimina solo eventos con `simulado === true` y deja el evento `LOG_SIMULADOS_BORRADOS`. Una alerta se «revisa» agregando un evento `ALERTA_REVISADA`; la alerta original no se modifica.

## 6. Reglas de detección

`evaluarReglasDeteccion` se ejecuta tras cada `registrarEvento`. Calcula las ventanas con la **fecha del propio evento** (no la hora actual) y solo compara eventos del mismo origen (reales con reales; los de una corrida del simulador solo entre sí). Las alertas y sus revisiones no disparan reglas.

| # | Regla | Evento que la evalúa | Condición | Nivel | Deduplicación |
|---|---|---|---|---|---|
| 1 | Fuerza bruta | intento fallido (`LOGIN_FALLIDO` o `CUENTA_BLOQUEADA` con `FALLO`) | ≥ 3 del mismo correo en < 5 min | ALTO | por correo, dentro de la ventana |
| 2 | Enumeración de cuentas | intento fallido | ≥ 3 correos distintos en < 5 min | ALTO | global, dentro de la ventana |
| 3 | Escalamiento de privilegios | `ACCESO_DENEGADO` | ≥ 2 del mismo usuario y la misma sesión | ALTO | una por usuario y sesión |
| 4 | Acceso fuera de horario | `LOGIN_EXITOSO` | hora local < 08:00 o ≥ 18:00 | MEDIO | una por cada login |
| 5 | Fallos de MFA | `MFA_FALLIDO` | ≥ 3 del mismo usuario en < 5 min | ALTO | por usuario, dentro de la ventana |

Nota: el tercer intento fallido de contraseña se registra como `CUENTA_BLOQUEADA` (no como `LOGIN_FALLIDO`), por eso la definición de «intento fallido» incluye ambos.

Umbrales y ventana son constantes al inicio de `js/logs.js` (`VENTANA_DETECCION_MS`, `UMBRAL_*`).

## 7. Simulador de incidentes

`simulador.html` (solo administrador, con el aviso «MODO SIMULACIÓN – entorno académico») invoca funciones de `js/simulador.js`. Cada ejecución crea una **corrida** con id propio; sus eventos llevan `simulado: true`, un detalle que empieza con «SIMULADO» y fechas ajustadas al escenario. Pasan por `registrarEvento`, así que se evalúan con las mismas reglas que los eventos reales. El simulador no modifica bloqueos ni sesiones.

## 8. Pruebas automatizadas

`pruebas.html` ejecuta 27 casos contra el código real:

| Grupo | Casos | Qué verifican |
|---|---|---|
| Login | P1–P9 | Validación, mensajes genéricos, bloqueo, XSS, acceso denegado de paciente y recepcionista a `panel-logs.html`, y acceso del administrador |
| Control de acceso | M6 | Matriz completa: qué páginas abre cada uno de los 4 roles |
| MFA | P10–P15 | Código correcto, incorrecto, agotado, expirado, saltarse el MFA, roles sin MFA |
| Simulador | E1–E4 | Cada escenario genera exactamente la alerta esperada |
| Falsos positivos | F1–F7 | Actividad legítima que no debe generar alertas |

**Aislamiento.** Antes de empezar se respaldan en memoria `dentacita_logs`, `dentacita_bloqueos`, `dentacita_sesion` y `dentacita_mfa_pendiente`; cada caso arranca con ellos vacíos; al terminar (también si hay un error) se restauran. En `localStorage` se guarda además una copia de **solo los datos** (registro y bloqueos) para recuperarlos si la pestaña se cierra a mitad de la ejecución; **la sesión nunca se persiste**, para que otro usuario no pueda heredarla. Al final se agrega al registro real un único evento `PRUEBAS_EJECUTADAS`.

**Métricas**

| Métrica | Cómo se calcula |
|---|---|
| % de casos superados | casos que cumplen / casos totales |
| Tasa de detección | alertas esperadas que se generaron / alertas esperadas (casos P5, P12, E1–E4) |
| Falsos positivos | casos benignos (F1–F7) que generaron alguna alerta, y el total de alertas generadas |
| Tiempo promedio de login | promedio de 8 ejecuciones de `iniciarSesion` con contraseña correcta (incluye `fetch` de `usuarios.json` y PBKDF2) |
| Tiempo de hash | promedio de 50 SHA-256 frente a 5 PBKDF2 de 150 000 iteraciones, y cuántas veces más lento es |
| Verificación del MFA | promedio de 20 ejecuciones de `verificarCodigoMFA` con código correcto (incluye crear la sesión y registrar eventos) |

Los tiempos se miden con `performance.now()` y dependen del equipo y del navegador, por eso la página registra fecha, hora, navegador, plataforma, zona horaria y URL de cada ejecución. La exportación JSON incluye todo; el CSV (UTF-8 con BOM) incluye entorno, tabla de casos y métricas, y neutraliza celdas que empiezan con `= + - @` para evitar inyección de fórmulas al abrirlo en Excel.

## 9. Decisiones de diseño

- **Un solo punto de verdad para el control de acceso:** `ROLES_POR_PAGINA` y `evaluarAcceso` (la parte lógica de `verificarAcceso`, sin navegación) permiten probar automáticamente lo mismo que ejecutan las páginas.
- **Mínimo privilegio:** el registro, el simulador y las pruebas son solo del administrador; la recepcionista gestiona citas pero no audita.
- **Mensajes genéricos y tiempos parejos:** misma respuesta y mismo costo de cómputo para correos existentes e inexistentes.
- **`textContent` en todo dato dinámico:** los pocos `innerHTML` restantes (formularios y encabezado de tabla en `citas.html`, y un texto fijo en `simulador.html`) arman plantillas estáticas sin datos de usuario; los datos se insertan con el DOM.

## 10. Limitaciones del prototipo

1. **No hay servidor.** Toda validación, el bloqueo, el MFA y el control de acceso se ejecutan en el navegador; quien controle el navegador puede modificar `localStorage` y `sessionStorage`, o saltarse el JavaScript. Es una demostración de los controles, no un sistema seguro.
2. **MFA simulado.** El código se muestra en la misma pantalla y se guarda en `sessionStorage`; no hay un segundo canal. En producción lo enviaría el servidor por SMS, correo o aplicación autenticadora y también lo verificaría el servidor.
3. **`usuarios.json` es público.** Expone correos, sal e iteraciones y hash de cada usuario (permite ataques de diccionario fuera de línea). En producción el servidor guardaría y verificaría el hash, idealmente con Argon2id o bcrypt.
4. **Bloqueo evadible.** El contador de intentos vive en `localStorage`: borrar los datos del sitio lo reinicia, y es por navegador, no global.
5. **Registro no inmutable.** El modelo «solo agregar» es una garantía de la interfaz; requeriría almacenamiento en servidor (idealmente con firmas o cadena de hashes) para ser a prueba de manipulación.
6. **Reloj del cliente.** La caducidad del código MFA, las ventanas de detección y el horario dependen de la hora del dispositivo.
7. **Datos locales.** Las citas y el registro son de cada navegador: no se comparten entre usuarios ni dispositivos.
8. **Cobertura de pruebas.** Las pruebas automatizadas verifican la lógica y el control de acceso, no el aspecto visual ni la navegación real entre páginas; esas comprobaciones siguen siendo manuales (guía P1–P15 del README).
