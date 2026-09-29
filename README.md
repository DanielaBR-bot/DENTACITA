# DentaCita

Prototipo académico de agendamiento de citas para el consultorio ficticio **"Consultorio Dental Sonrisa"**, hecho con **HTML5, CSS3 y JavaScript puro** (sin frameworks ni backend) y con enfoque en ciberseguridad.

🔗 **Demo en línea:** https://danielabr-bot.github.io/DENTACITA/
📦 **Código:** https://github.com/DanielaBR-bot/DENTACITA

## Probar rápido

1. Abre la [demo](https://danielabr-bot.github.io/DENTACITA/).
2. Inicia sesión con uno de los [usuarios de prueba](#usuarios-de-prueba).
3. Explora lo que ve cada rol (ver tabla abajo).

| Rol | Qué puede hacer |
|---|---|
| **Paciente** | Ver y solicitar solo sus propias citas |
| **Recepcionista** | Ver todas las citas, crearlas, reprogramarlas y cancelarlas (no tiene acceso al registro de eventos) |
| **Odontólogo** | Ver únicamente su agenda del día actual |
| **Administrador** | Consultar el registro de eventos de seguridad; no accede a la agenda de citas |

## Usuarios de prueba

Solo para el prototipo. En `data/usuarios.json` las contraseñas están guardadas únicamente como hash SHA-256.

| Rol | Correo | Contraseña |
|---|---|---|
| Recepcionista | recepcion@sonrisa.ec | `Recepcion#2024` |
| Odontólogo | odontologo@sonrisa.ec | `Odontologo#2024` |
| Paciente | paciente1@sonrisa.ec | `Paciente#2024` |
| Paciente | paciente2@sonrisa.ec | `Paciente#2025` |
| Administrador | admin@sonrisa.ec | `Admin#2024` |

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

Para reiniciar los datos de prueba (citas, bloqueos, logs), borra el almacenamiento del sitio desde las herramientas del navegador (F12 → Application → Clear site data).

## Cómo funciona (sin backend real)

| Dato | Dónde se guarda |
|---|---|
| Usuarios | `data/usuarios.json`, leído con `fetch()` |
| Citas | `localStorage` (`dentacita_citas`) |
| Registro de eventos | `localStorage` (`dentacita_logs`) |
| Intentos fallidos y bloqueos | `localStorage` (`dentacita_bloqueos`) |
| Sesión activa | `sessionStorage` (se borra al cerrar la pestaña o cerrar sesión) |

Como todo corre en el navegador, los datos son locales a cada navegador y **no se comparten entre usuarios**.

## Controles de seguridad implementados

| Control | Descripción | Dónde |
|---|---|---|
| Hash de contraseñas | Nunca se guardan ni comparan en texto plano; SHA-256 con Web Crypto API | `js/auth.js` |
| Validación de entrada | Correo con formato válido, máx. 60 caracteres; contraseña de 8-64 caracteres con mayúscula, minúscula y número | `js/validacion.js` |
| Anti-XSS | Se recortan espacios y se escapan `< > " ' &`; los datos de usuario se muestran con `textContent`, nunca con `innerHTML` | `js/validacion.js`, páginas |
| Mensajes genéricos | "Usuario o contraseña incorrectos", sin revelar si el correo existe | `js/auth.js` |
| Mitigación de temporización | Hash "señuelo" cuando el correo no existe, para que el tiempo de respuesta no delate cuentas válidas | `js/auth.js` |
| Bloqueo por intentos | 3 intentos fallidos → cuenta bloqueada 5 minutos | `js/auth.js` |
| Control de sesión | Solo se guardan un id de sesión aleatorio, correo, nombre y rol; nunca la contraseña ni el hash | `js/auth.js` |
| Control de acceso por rol | Cada página valida el rol; si no corresponde, redirige a la página de su rol y registra `ACCESO_DENEGADO` | `js/auth.js` (`verificarAcceso`, `paginaInicioPorRol`) |
| Mínimo privilegio | El registro de eventos es exclusivo del rol `administrador`; recepción, odontología y pacientes no lo ven | `panel-logs.html` |
| Alerta de horario | Ingreso fuera de 08:00-18:00: se permite, pero se registra `ACCESO_FUERA_HORARIO` como alerta | `js/auth.js` |
| Registro de eventos | Login, bloqueos, accesos denegados, citas y logout, con id único, fecha, usuario, rol, acción y resultado; nunca contraseñas | `js/logs.js`, `panel-logs.html` |
| Integridad del registro | Registro "solo agregar": la interfaz no permite editar ni borrar eventos; las alertas se revisan agregando un evento `ALERTA_REVISADA`, sin tocar la alerta original | `js/logs.js`, `panel-logs.html` |
| Detección de amenazas | Reglas automáticas que generan eventos `ALERTA_SEGURIDAD` (ver tabla abajo) | `js/logs.js` |
| Panel de auditoría | Tarjetas resumen, alertas activas (rojo = ALTO, naranja = MEDIO), filtros por usuario, rol, acción, resultado y fechas, y exportación a `.json` | `panel-logs.html` |
| Simulador de incidentes | Genera eventos simulados (marcados `SIMULADO`) para probar las reglas; solo administrador y con aviso visible de modo simulación | `simulador.html`, `js/simulador.js` |

### Reglas de detección

Se evalúan cada vez que se registra un evento, con la fecha del propio evento. Un intento fallido es un `LOGIN_FALLIDO` o un `CUENTA_BLOQUEADA` con resultado `FALLO`, porque el tercer intento (el que bloquea la cuenta) se registra como `CUENTA_BLOQUEADA`.

| Regla | Condición | Nivel |
|---|---|---|
| Fuerza bruta | 3 o más intentos fallidos del mismo correo en menos de 5 minutos | ALTO |
| Enumeración de cuentas | Intentos fallidos con 3 o más correos distintos en menos de 5 minutos | ALTO |
| Escalamiento de privilegios | 2 o más `ACCESO_DENEGADO` del mismo usuario en la misma sesión | ALTO |
| Acceso fuera de horario | Inicio de sesión antes de las 08:00 o desde las 18:00 | MEDIO |

Para no llenar el panel de duplicados, una misma regla no vuelve a alertar sobre el mismo correo (o la misma sesión) mientras la alerta anterior siga dentro de la ventana de 5 minutos.

## Simulador de incidentes

`simulador.html` (solo administrador) muestra el aviso **MODO SIMULACIÓN – entorno académico** y tiene un botón por escenario. Los eventos generados llevan `simulado: true` y su detalle empieza con «SIMULADO». Pasan por las mismas reglas de detección que los eventos reales y al terminar se muestran las alertas resultantes. No se modifican cuentas ni bloqueos reales.

| Escenario | Qué simula | Alerta esperada |
|---|---|---|
| 1 | 5 intentos fallidos contra `recepcion@sonrisa.ec` en 1 minuto, con bloqueo | Fuerza bruta (ALTO) |
| 2 | Ingreso de `recepcion@sonrisa.ec` a las 23:40 | Acceso fuera de horario (MEDIO) |
| 3 | `paciente1@sonrisa.ec` intenta abrir `panel-logs.html` y `simulador.html` | Escalamiento de privilegios (ALTO) |
| 4 | 4 correos distintos que no existen | Enumeración de cuentas (ALTO) |

El botón **Borrar eventos simulados** elimina solo los eventos marcados como simulados (con sus alertas) y deja el evento `LOG_SIMULADOS_BORRADOS` como constancia. Es la única operación de borrado del registro.
| Cierre de sesión | Botón en todas las páginas internas; limpia la sesión y registra `LOGOUT` | `js/auth.js` |

## Guía de pruebas

Casos sugeridos para comprobar los controles:

| # | Caso | Qué hacer | Resultado esperado |
|---|---|---|---|
| P1 | Formulario vacío | Enviar el login sin datos | Mensajes de validación; no se intenta autenticar |
| P2 | Correo inválido | Escribir `abc` o `a@b` | Error de formato del correo |
| P3 | Contraseña débil | Probar `12345678` o `password` | Error de requisitos de contraseña |
| P4 | Credenciales incorrectas | Correo válido con contraseña equivocada | Mensaje genérico e intento registrado en logs |
| P5 | Bloqueo | Fallar 3 veces seguidas | Cuenta bloqueada 5 minutos (`CUENTA_BLOQUEADA`) |
| P6 | Intento de XSS | Escribir `<script>alert(1)</script>` en el correo | Se rechaza o se escapa; no se ejecuta nada |
| P7 | Acceso por rol | Como paciente o recepcionista, abrir `panel-logs.html` por URL | Redirección a la agenda y evento `ACCESO_DENEGADO` |
| P8 | Comportamiento por rol | Entrar con cada usuario | Cada uno ve solo lo que le corresponde |

Después de las pruebas, entra como administrador (`admin@sonrisa.ec`) para ver los eventos registrados en `panel-logs.html`.

### Pruebas de las reglas de detección y del panel

Ingresa como administrador y ejecuta cada escenario en `simulador.html`; luego revisa el resultado en `panel-logs.html`.

| # | Prueba | Qué hacer | Resultado esperado |
|---|---|---|---|
| P9 | Escenario 1: fuerza bruta | Ejecutar el escenario 1 | 5 eventos simulados y una alerta ALTO «Fuerza bruta» contra `recepcion@sonrisa.ec` |
| P10 | Escenario 2: fuera de horario | Ejecutar el escenario 2 | Una alerta MEDIO «Acceso fuera de horario» (23:40) |
| P11 | Escenario 3: escalamiento | Ejecutar el escenario 3 | Una alerta ALTO «Escalamiento de privilegios» de `paciente1@sonrisa.ec` |
| P12 | Escenario 4: enumeración | Ejecutar el escenario 4 | Una alerta ALTO «Enumeración de cuentas» |
| P13 | Revisar alerta | En el panel, pulsar «Marcar como revisada» | La alerta sale de «Alertas activas», baja el contador y aparece un evento `ALERTA_REVISADA` |
| P14 | Filtros | Filtrar por rol, acción, resultado, usuario y fechas; pulsar «Limpiar filtros» | La tabla muestra solo lo que coincide; al limpiar vuelven todos los eventos |
| P15 | Exportar | Pulsar «Exportar registro (.json)» | Se descarga `dentacita_logs_AAAA-MM-DD.json` con todos los eventos |
| P16 | Borrar simulados | En el simulador, «Borrar eventos simulados» | Desaparecen solo los simulados; los reales se conservan |
| P17 | Regla en vivo | Sin simulador: fallar la contraseña 3 veces con el mismo correo en menos de 5 minutos | Alerta ALTO «Fuerza bruta» en el panel |

## Estructura del proyecto

```
dentacita/
├── index.html          Inicio de sesión
├── citas.html          Agenda según el rol
├── panel-logs.html     Registro de eventos y alertas (solo administrador)
├── simulador.html      Simulador de incidentes (solo administrador)
├── css/estilos.css
├── js/
│   ├── validacion.js   Reglas de validación y sanitización
│   ├── auth.js         Hash, bloqueo, sesión y roles
│   ├── logs.js         Registro de eventos, reglas de detección y alertas
│   └── simulador.js    Escenarios de simulación
├── data/usuarios.json  Usuarios de prueba
└── README.md
```

## Limitaciones

- Es un prototipo educativo: **la seguridad del lado del cliente no reemplaza a un backend**. Cualquiera con acceso al navegador puede modificar `localStorage`, saltarse validaciones o leer el JSON de usuarios.
- SHA-256 sin sal es adecuado para la demostración, pero en producción se usaría un algoritmo lento con sal (bcrypt, Argon2) en el servidor.
- El bloqueo por intentos se puede evadir borrando el almacenamiento del navegador.

- El registro "solo agregar" es una garantía de la interfaz: quien controle el navegador puede editar `localStorage` directamente. Un registro realmente inmutable requeriría almacenamiento en un servidor.
