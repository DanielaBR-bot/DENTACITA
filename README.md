# DentaCita

Prototipo académico de agendamiento de citas para el consultorio ficticio **"Consultorio Dental Sonrisa"**, hecho con **HTML5, CSS3 y JavaScript puro** (sin frameworks, sin librerías externas, sin backend ni base de datos) y con enfoque en ciberseguridad: contraseñas con PBKDF2, autenticación multifactor simulada, control de acceso por roles, registro de eventos, detección de amenazas, simulador de incidentes y pruebas automatizadas.

🔗 **Demo en línea:** https://danielabr-bot.github.io/DENTACITA/
📦 **Código:** https://github.com/DanielaBR-bot/DENTACITA

## Probar rápido

1. Abre la [demo](https://danielabr-bot.github.io/DENTACITA/).
2. Inicia sesión con uno de los [usuarios de prueba](#usuarios-de-prueba).
3. Si eres administrador o recepcionista, completa la verificación en dos pasos (el código aparece en un panel «Dispositivo simulado»).

| Rol | MFA | Qué puede hacer |
|---|---|---|
| **Paciente** | No | Ver y solicitar solo sus propias citas |
| **Odontólogo** | No | Ver únicamente su agenda del día actual |
| **Recepcionista** | **Sí** | Ver todas las citas, crearlas, reprogramarlas y cancelarlas (no accede al registro de eventos) |
| **Administrador** | **Sí** | Consultar el registro de eventos, usar el simulador de incidentes y ejecutar las pruebas automatizadas; no accede a la agenda |

## Usuarios de prueba

Solo para el prototipo. En `data/usuarios.json` las contraseñas están guardadas únicamente como hash **PBKDF2-SHA256 con sal única por usuario y 150 000 iteraciones**; aquí se documentan en texto plano solo para poder probar.

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | admin@sonrisa.ec | `Admin#2024` |
| Recepcionista | recepcion@sonrisa.ec | `Recepcion#2024` |
| Odontólogo | odontologo@sonrisa.ec | `Odontologo#2024` |
| Paciente | paciente1@sonrisa.ec | `Paciente#2024` |
| Paciente | paciente2@sonrisa.ec | `Paciente#2025` |

**Código MFA:** administrador y recepcionista reciben un código de 6 dígitos que **no se envía a ningún lado**: se muestra en pantalla dentro del panel rotulado «SIMULACIÓN – Dispositivo simulado / Correo simulado». El código vence a los 2 minutos y permite 3 intentos.

## Ejecutarlo en tu computadora

Necesitas servirlo por HTTP: si abres `index.html` con doble clic (`file://`), el navegador bloquea el `fetch()` a `data/usuarios.json`.

**Opción A: Live Server (VS Code)**
1. Abre la carpeta del proyecto en VS Code e instala la extensión *Live Server*.
2. Clic derecho en `index.html` → **Open with Live Server**.

**Opción B: Python**
```bash
python -m http.server 5500
# abre http://localhost:5500
```

Para reiniciar los datos de prueba (citas, bloqueos, registro), borra el almacenamiento del sitio desde las herramientas del navegador (F12 → Application → Clear site data).

## Flujo de inicio de sesión

```
index.html ──► validar formato ──► ¿cuenta bloqueada? ──sí──► "Cuenta bloqueada temporalmente"
                                        │ no
                                        ▼
                         derivar PBKDF2 y comparar con usuarios.json
                          │ incorrecta                      │ correcta
                          ▼                                 ▼
              LOGIN_FALLIDO (3.º intento:        ¿rol con MFA (administrador / recepcionista)?
              CUENTA_BLOQUEADA, 5 min)             │ no                      │ sí
                                                   ▼                         ▼
                                       crear sesión + LOGIN_EXITOSO   MFA_ENVIADO → mfa.html (sin sesión)
                                       → página de su rol                    │
                                                                 código correcto ──► MFA_EXITOSO + sesión
                                                                 incorrecto ──► MFA_FALLIDO (3 → cancela + alerta)
                                                                 vencido ──► MFA_EXPIRADO
```

Detalle completo en [docs/MANUAL_TECNICO.md](docs/MANUAL_TECNICO.md).

## Cómo funciona (sin backend real)

| Dato | Dónde se guarda |
|---|---|
| Usuarios (con sal e iteraciones) | `data/usuarios.json`, leído con `fetch()` |
| Citas | `localStorage` (`dentacita_citas`) |
| Registro de eventos | `localStorage` (`dentacita_logs`) |
| Intentos fallidos y bloqueos | `localStorage` (`dentacita_bloqueos`) |
| Sesión activa | `sessionStorage` (`dentacita_sesion`; se borra al cerrar la pestaña o cerrar sesión) |
| Código MFA pendiente | `sessionStorage` (`dentacita_mfa_pendiente`; se borra al verificarlo, agotarlo o vencer) |

Como todo corre en el navegador, los datos son locales a cada navegador y **no se comparten entre usuarios**.

## Controles de seguridad implementados

| Control | Descripción | Dónde |
|---|---|---|
| Hash de contraseñas | Nunca se guardan ni comparan en texto plano; PBKDF2-SHA256 con sal única por usuario y 150 000 iteraciones (Web Crypto API); comparación en tiempo constante; se rechazan registros con menos de 100 000 iteraciones | `js/auth.js` |
| Autenticación multifactor (simulada) | Obligatoria para administrador y recepcionista: código de 6 dígitos con `crypto.getRandomValues`, vigencia de 2 minutos, 3 intentos; la sesión no existe hasta superarlo | `js/mfa.js`, `mfa.html` |
| Validación de entrada | Correo con formato válido, máx. 60 caracteres; contraseña de 8-64 caracteres con mayúscula, minúscula y número | `js/validacion.js` |
| Anti-XSS | Se recortan espacios y se escapan `< > " ' &`; los datos de usuario se muestran con `textContent`, nunca con `innerHTML` | `js/validacion.js`, páginas |
| Mensajes genéricos | «Usuario o contraseña incorrectos», sin revelar si el correo existe | `js/auth.js` |
| Mitigación de temporización | Cuando el correo no existe se deriva igualmente un PBKDF2 con una sal señuelo, para que el tiempo de respuesta no delate cuentas válidas | `js/auth.js` |
| Bloqueo por intentos | 3 intentos fallidos → cuenta bloqueada 5 minutos | `js/auth.js` |
| Control de sesión | Solo se guardan un id de sesión aleatorio, correo, nombre y rol; nunca la contraseña ni el hash | `js/auth.js` |
| Control de acceso por rol | Cada página valida el rol (tabla `ROLES_POR_PAGINA`); si no corresponde, redirige a la página de su rol y registra `ACCESO_DENEGADO` | `js/auth.js` (`evaluarAcceso`, `verificarAcceso`) |
| Mínimo privilegio | El registro de eventos, el simulador y las pruebas son exclusivos del rol `administrador` | `ROLES_POR_PAGINA` |
| Alerta de horario | Ingreso fuera de 08:00-18:00: se permite, pero se registra `ACCESO_FUERA_HORARIO` | `js/auth.js` |
| Registro de eventos | Login, MFA, bloqueos, accesos denegados, citas y logout, con id único, fecha, usuario, rol, acción y resultado; nunca contraseñas ni códigos MFA | `js/logs.js` |
| Integridad del registro | Registro «solo agregar»: la interfaz no permite editar ni borrar eventos; las alertas se revisan agregando un evento `ALERTA_REVISADA`, sin tocar la alerta original | `js/logs.js`, `panel-logs.html` |
| Detección de amenazas | Cinco reglas automáticas que generan eventos `ALERTA_SEGURIDAD` | `js/logs.js` |
| Panel de auditoría | Tarjetas resumen, alertas activas (rojo = ALTO, naranja = MEDIO), filtros por usuario, rol, acción, resultado y fechas, y exportación a `.json` | `panel-logs.html` |
| Simulador de incidentes | Genera eventos simulados (marcados `SIMULADO`) para probar las reglas; solo administrador y con aviso visible de modo simulación | `simulador.html`, `js/simulador.js` |
| Pruebas automatizadas | 26 casos y 6 métricas de calidad, en un entorno aislado que no altera el registro real; exporta JSON y CSV | `pruebas.html`, `js/pruebas.js` |
| Cierre de sesión | Botón en todas las páginas internas; limpia la sesión y registra `LOGOUT` | `js/auth.js` |

### Reglas de detección

Se evalúan cada vez que se registra un evento, con la fecha del propio evento. Un intento fallido es un `LOGIN_FALLIDO` o un `CUENTA_BLOQUEADA` con resultado `FALLO`, porque el tercer intento (el que bloquea la cuenta) se registra como `CUENTA_BLOQUEADA`.

| Regla | Condición | Nivel |
|---|---|---|
| Fuerza bruta | 3 o más intentos fallidos del mismo correo en menos de 5 minutos | ALTO |
| Enumeración de cuentas | Intentos fallidos con 3 o más correos distintos en menos de 5 minutos | ALTO |
| Escalamiento de privilegios | 2 o más `ACCESO_DENEGADO` del mismo usuario en la misma sesión | ALTO |
| Acceso fuera de horario | Inicio de sesión antes de las 08:00 o desde las 18:00 | MEDIO |
| Fallos de MFA | 3 o más `MFA_FALLIDO` del mismo usuario en menos de 5 minutos | ALTO |

Para no llenar el panel de duplicados, una misma regla no vuelve a alertar sobre el mismo correo (o la misma sesión) mientras la alerta anterior siga dentro de la ventana de 5 minutos.

## Simulador de incidentes

`simulador.html` (solo administrador) muestra el aviso **MODO SIMULACIÓN – entorno académico** y tiene un botón por escenario. Los eventos generados llevan `simulado: true` y su detalle empieza con «SIMULADO». Pasan por las mismas reglas de detección que los eventos reales y al terminar se muestran las alertas resultantes. No se modifican cuentas ni bloqueos reales.

| Escenario | Qué simula | Alerta esperada |
|---|---|---|
| E1 | 5 intentos fallidos contra `recepcion@sonrisa.ec` en 1 minuto, con bloqueo | Fuerza bruta (ALTO) |
| E2 | Ingreso de `recepcion@sonrisa.ec` a las 23:40 (con su MFA) | Acceso fuera de horario (MEDIO) |
| E3 | `paciente1@sonrisa.ec` intenta abrir `panel-logs.html` y `simulador.html` | Escalamiento de privilegios (ALTO) |
| E4 | 4 correos distintos que no existen | Enumeración de cuentas (ALTO) |

El botón **Borrar eventos simulados** elimina solo los eventos marcados como simulados (con sus alertas) y deja el evento `LOG_SIMULADOS_BORRADOS` como constancia. Es la única operación de borrado del registro.

## Guía de pruebas

### Casos de login y control de acceso (P1–P9)

| # | Caso | Qué hacer | Resultado esperado |
|---|---|---|---|
| P1 | Formulario vacío | Enviar el login sin datos | Mensajes de validación; no se intenta autenticar |
| P2 | Correo inválido | Escribir `abc` o `a@b` | Error de formato del correo |
| P3 | Contraseña débil | Probar `12345678` o `password` | Error de requisitos de contraseña |
| P4 | Credenciales incorrectas | Correo válido con contraseña equivocada | Mensaje genérico e intento registrado en logs |
| P5 | Bloqueo | Fallar 3 veces seguidas | Cuenta bloqueada 5 minutos (`CUENTA_BLOQUEADA`) y alerta ALTO de fuerza bruta |
| P6 | Intento de XSS | Escribir `<script>alert(1)</script>` en el correo | Se rechaza o se escapa; no se ejecuta nada |
| P7 | Acceso por rol | Como paciente o recepcionista (esta última tras el MFA), abrir `panel-logs.html` por URL | Redirección a la agenda y evento `ACCESO_DENEGADO` |
| P8 | Comportamiento por rol | Entrar con cada usuario; administrador y recepcionista completan antes el MFA | Cada rol accede solo a lo que le corresponde: paciente, odontólogo y recepcionista a la agenda; administrador al registro de eventos |
| P9 | Administrador abre la agenda | Credenciales correctas de administrador (y MFA) y abrir `citas.html` por URL | Acceso solo al registro de eventos; no puede abrir la agenda |

### Casos de MFA (P10–P15)

| # | Caso | Qué hacer | Resultado esperado |
|---|---|---|---|
| P10 | Código correcto | Iniciar sesión como recepcionista o administrador e ingresar el código del panel simulado | Acceso según el rol; eventos `MFA_ENVIADO`, `MFA_EXITOSO` y `LOGIN_EXITOSO` |
| P11 | Código incorrecto | Ingresar un código distinto del mostrado | `MFA_FALLIDO`; el sistema indica los intentos que quedan |
| P12 | Tres códigos incorrectos | Equivocarse tres veces seguidas | Login cancelado (hay que ingresar la contraseña de nuevo) y alerta ALTO en el registro |
| P13 | Código expirado | Esperar más de 2 minutos antes de ingresar el código | Mensaje de expiración y evento `MFA_EXPIRADO` |
| P14 | Saltarse el MFA | Tras la contraseña, abrir `citas.html` o `panel-logs.html` por URL sin ingresar el código | Redirección al inicio de sesión; no existe sesión |
| P15 | Roles sin MFA | Iniciar sesión como paciente y como odontólogo | Entran solo con la contraseña, sin código ni eventos MFA |

### Simulador y panel de eventos

Ingresa como administrador, ejecuta cada escenario en `simulador.html` y revisa el resultado en `panel-logs.html`.

| # | Prueba | Qué hacer | Resultado esperado |
|---|---|---|---|
| E1–E4 | Escenarios del simulador | Ejecutar cada escenario (tabla de arriba) | La alerta indicada, con eventos marcados `SIMULADO` |
| M1 | Revisar alerta | En el panel, pulsar «Marcar como revisada» | La alerta sale de «Alertas activas», baja el contador y aparece `ALERTA_REVISADA` |
| M2 | Filtros | Filtrar por rol, acción, resultado, usuario y fechas; «Limpiar filtros» | La tabla muestra solo lo que coincide; al limpiar vuelven todos los eventos |
| M3 | Exportar | Pulsar «Exportar registro (.json)» | Se descarga `dentacita_logs_AAAA-MM-DD.json` con todos los eventos |
| M4 | Borrar simulados | En el simulador, «Borrar eventos simulados» | Desaparecen solo los simulados; los reales se conservan |
| M5 | Regla en vivo | Sin simulador: fallar la contraseña 3 veces con el mismo correo en menos de 5 minutos | Alerta ALTO «Fuerza bruta» en el panel |

### Pruebas automatizadas (`pruebas.html`)

Ingresa como administrador y abre **Pruebas automatizadas** en la barra superior. Al cargar, la página ejecuta sola 26 casos:

- **P1–P15** (login, control de acceso y MFA),
- **E1–E4** (los cuatro escenarios del simulador) y
- **F1–F7** (actividad legítima que **no** debe generar alertas, para medir falsos positivos).

Muestra una tabla con caso, resultado esperado, resultado obtenido y veredicto **CUMPLE / NO CUMPLE**, más estas métricas: porcentaje de casos superados, tasa de detección de las reglas, falsos positivos, tiempo promedio de login, tiempo de hash SHA-256 frente a PBKDF2 y tiempo de verificación del MFA. Arriba se registran la **fecha, la hora y el navegador** de la ejecución para usarlos como evidencia, y los resultados se exportan en **JSON** y **CSV**.

Las pruebas **no alteran el registro real**: antes de empezar se respaldan el registro, los bloqueos y la sesión, cada caso arranca con el estado vacío y al terminar todo se restaura. En el registro real solo queda un evento `PRUEBAS_EJECUTADAS` con el resumen. Los tiempos dependen de tu equipo y navegador.

## Estructura del proyecto

```
dentacita/
├── index.html          Inicio de sesión
├── mfa.html            Verificación en dos pasos (código simulado)
├── citas.html          Agenda según el rol
├── panel-logs.html     Registro de eventos y alertas (solo administrador)
├── simulador.html      Simulador de incidentes (solo administrador)
├── pruebas.html        Pruebas automatizadas y métricas (solo administrador)
├── css/estilos.css
├── js/
│   ├── comun.js        Constantes y utilidades compartidas (ids, fechas, descargas)
│   ├── validacion.js   Reglas de validación y sanitización
│   ├── auth.js         PBKDF2, bloqueo, sesión y control de acceso por rol
│   ├── mfa.js          Autenticación multifactor simulada
│   ├── logs.js         Registro de eventos, reglas de detección y alertas
│   ├── simulador.js    Escenarios de simulación
│   └── pruebas.js      Casos de prueba, métricas y exportación
├── data/usuarios.json  Usuarios de prueba (PBKDF2 con sal)
├── docs/
│   ├── MANUAL_USUARIO.md
│   └── MANUAL_TECNICO.md
└── README.md
```

## Documentación

- [Manual de usuario](docs/MANUAL_USUARIO.md): pasos por rol, incluido el MFA.
- [Manual técnico](docs/MANUAL_TECNICO.md): arquitectura, módulos, flujo de autenticación con MFA, estructura del registro, reglas de detección y limitaciones.

## Limitaciones

- Es un prototipo educativo: **la seguridad del lado del cliente no reemplaza a un backend**. Cualquiera con acceso al navegador puede modificar `localStorage` y `sessionStorage`, saltarse validaciones o leer el JSON de usuarios.
- El MFA es una **simulación**: el código se muestra en pantalla y se guarda en `sessionStorage` mientras dura el desafío. En un sistema real llegaría por un canal independiente (SMS, correo o aplicación autenticadora) y se verificaría en el servidor.
- PBKDF2 es adecuado para la demostración, pero `usuarios.json` es público (incluye sal y hash) y el cálculo ocurre en el navegador. En producción el hash se verificaría en el servidor, idealmente con Argon2 o bcrypt, y nunca se expondría al cliente.
- El bloqueo por intentos se puede evadir borrando el almacenamiento del navegador.
- El registro «solo agregar» es una garantía de la interfaz: quien controle el navegador puede editar `localStorage` directamente. Un registro realmente inmutable requeriría almacenamiento en un servidor.
