# DentaCita

Prototipo académico de agendamiento de citas para el consultorio ficticio
**"Consultorio Dental Sonrisa"**. Proyecto desarrollado con **HTML5, CSS3 y
JavaScript puro** (sin frameworks ni backend real), como ejercicio de
tecnología web con enfoque en ciberseguridad.

## Descripción del proyecto

DentaCita simula un sistema de agendamiento de citas dentales con control de
acceso por roles:

- **Paciente**: inicia sesión y solo ve/solicita sus propias citas.
- **Recepcionista**: ve y gestiona todas las citas (crear, reprogramar,
  cancelar) y tiene acceso al registro de eventos de seguridad.
- **Odontólogo**: ve únicamente su agenda del día actual.

Los "datos de backend" están simulados:

- Los **usuarios** se leen desde [`data/usuarios.json`](data/usuarios.json)
  mediante `fetch()`.
- Las **citas** y el **registro de eventos** se guardan en el
  `localStorage` del navegador.
- La **sesión activa** se guarda en `sessionStorage` (se borra al cerrar la
  pestaña o al cerrar sesión).

No existe backend ni base de datos real: todo corre en el navegador, por lo
que es un prototipo con fines educativos, no un sistema listo para
producción.

## Cómo ejecutarlo con Live Server

1. Abrir la carpeta `dentacita/` en Visual Studio Code.
2. Instalar la extensión **Live Server** (si no la tienes).
3. Clic derecho sobre `index.html` → **"Open with Live Server"**.
4. Se abrirá el navegador en una URL tipo `http://127.0.0.1:5500/...`.

> ⚠️ Es indispensable usar Live Server (o cualquier servidor local). Si se
> abre `index.html` directamente con doble clic (protocolo `file://`), la
> función `fetch()` no podrá leer `data/usuarios.json` por las políticas de
> seguridad del navegador (CORS).

## Usuarios de prueba

Las contraseñas se guardan **solo como hash SHA-256** en
`data/usuarios.json`. Aquí, únicamente con fines de prueba del prototipo,
se documentan en texto plano:

| Rol            | Correo                   | Contraseña        |
|-----------------|---------------------------|--------------------|
| Recepcionista   | recepcion@sonrisa.ec      | `Recepcion#2024`   |
| Odontólogo      | odontologo@sonrisa.ec     | `Odontologo#2024`  |
| Paciente        | paciente1@sonrisa.ec      | `Paciente#2024`    |
| Paciente        | paciente2@sonrisa.ec      | `Paciente#2025`    |

## Controles de seguridad implementados

| Control | Descripción | Dónde |
|---|---|---|
| Hash de contraseñas | Las contraseñas nunca se guardan ni comparan en texto plano; se usa SHA-256 vía Web Crypto API (`crypto.subtle.digest`) | `js/auth.js` |
| Validación de entrada | Correo con formato `usuario@dominio`, máx. 60 caracteres; contraseña de 8-64 caracteres con mayúscula, minúscula y número | `js/validacion.js` |
| Sanitización / anti-XSS | Se recortan espacios y se escapan `< > " ' &`; nunca se usa `innerHTML` con datos de usuario, siempre `textContent` | `js/validacion.js`, todas las páginas |
| Mensajes de error genéricos | "Usuario o contraseña incorrectos" sin indicar si el correo existe o no | `js/auth.js` |
| Mitigación de ataques de temporización | Se calcula un hash "señuelo" cuando el correo no existe, para que el tiempo de respuesta no delate si la cuenta es válida | `js/auth.js` |
| Bloqueo por intentos fallidos | Tras 3 intentos fallidos, la cuenta se bloquea 5 minutos (contador y hora de bloqueo en `localStorage`) | `js/auth.js` |
| Control de sesión | La sesión (correo, nombre, rol) se guarda en `sessionStorage`, nunca la contraseña ni el hash | `js/auth.js` |
| Control de acceso por rol | Cada página valida el rol de la sesión activa; si no corresponde, redirige y registra `ACCESO_DENEGADO` | `js/auth.js` (`verificarAcceso`) |
| Alerta de horario | Si el ingreso ocurre fuera de 08:00-18:00, se permite el acceso pero se genera una alerta y se registra `ACCESO_FUERA_HORARIO` | `js/auth.js` |
| Registro de eventos (logging) | Toda acción relevante (login, bloqueos, accesos denegados, citas, logout) se registra con fecha, usuario, rol, acción y resultado — **nunca contraseñas** | `js/logs.js`, `panel-logs.html` |
| Cierre de sesión | Botón "Cerrar sesión" disponible en todas las páginas internas, limpia `sessionStorage` y registra `LOGOUT` | `js/auth.js` |

## Estructura de carpetas

```
dentacita/
├── index.html            (inicio de sesión)
├── citas.html             (agenda según rol)
├── panel-logs.html        (registro de eventos, solo recepcionista)
├── css/estilos.css
├── js/validacion.js       (reglas de validación)
├── js/auth.js             (hash, bloqueo, sesión y roles)
├── js/logs.js             (registro de eventos)
├── data/usuarios.json     (usuarios de prueba)
└── README.md
```

## Próxima etapa (pendiente)

`panel-logs.html` y `js/logs.js` ya quedaron preparados para agregar:

- Filtros por usuario, rol, acción y rango de fechas.
- Alertas visuales destacadas para eventos críticos.
- Exportación del registro a un archivo `.json`
  (la función `exportarEventosComoJSON()` ya existe en `js/logs.js`).

## Guía de pruebas

Ver la sección **"Cómo probar los casos P1-P8"** que el asistente entregó
junto con este proyecto, con el paso a paso para validar formulario vacío,
correo inválido, contraseñas débiles/incorrectas, bloqueo por intentos,
intento de XSS y el comportamiento de cada rol.
