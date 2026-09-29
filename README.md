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
| Control de sesión | Solo se guardan correo, nombre y rol; nunca la contraseña ni el hash | `js/auth.js` |
| Control de acceso por rol | Cada página valida el rol; si no corresponde, redirige a la página de su rol y registra `ACCESO_DENEGADO` | `js/auth.js` (`verificarAcceso`, `paginaInicioPorRol`) |
| Mínimo privilegio | El registro de eventos es exclusivo del rol `administrador`; recepción, odontología y pacientes no lo ven | `panel-logs.html` |
| Alerta de horario | Ingreso fuera de 08:00-18:00: se permite, pero se registra `ACCESO_FUERA_HORARIO` como alerta | `js/auth.js` |
| Registro de eventos | Login, bloqueos, accesos denegados, citas y logout, con fecha, usuario, rol, acción y resultado; nunca contraseñas | `js/logs.js`, `panel-logs.html` |
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

## Estructura del proyecto

```
dentacita/
├── index.html          Inicio de sesión
├── citas.html          Agenda según el rol
├── panel-logs.html     Registro de eventos (solo administrador)
├── css/estilos.css
├── js/
│   ├── validacion.js   Reglas de validación y sanitización
│   ├── auth.js         Hash, bloqueo, sesión y roles
│   └── logs.js         Registro de eventos
├── data/usuarios.json  Usuarios de prueba
└── README.md
```

## Limitaciones

- Es un prototipo educativo: **la seguridad del lado del cliente no reemplaza a un backend**. Cualquiera con acceso al navegador puede modificar `localStorage`, saltarse validaciones o leer el JSON de usuarios.
- SHA-256 sin sal es adecuado para la demostración, pero en producción se usaría un algoritmo lento con sal (bcrypt, Argon2) en el servidor.
- El bloqueo por intentos se puede evadir borrando el almacenamiento del navegador.

## Próximas mejoras

- Filtros del panel de logs por usuario, rol, acción y rango de fechas.
- Alertas visuales destacadas para eventos críticos.
- Exportar el registro a `.json` (la función `exportarEventosComoJSON()` ya existe en `js/logs.js`).
