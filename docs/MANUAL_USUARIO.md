# DentaCita · Manual de usuario

Guía paso a paso para usar DentaCita según tu rol. DentaCita es un **prototipo académico** del «Consultorio Dental Sonrisa»: los datos son de ejemplo y se guardan solo en tu navegador.

**Aplicación en línea:** https://danielabr-bot.github.io/DENTACITA/

## 1. Antes de empezar

| Rol | ¿Necesita código MFA? | Página a la que entra |
|---|---|---|
| Paciente | No | Agenda (`citas.html`) |
| Odontólogo | No | Agenda (`citas.html`) |
| Recepcionista | **Sí** | Agenda (`citas.html`) |
| Administrador | **Sí** | Registro de eventos (`panel-logs.html`) |

Cuentas de prueba:

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | admin@sonrisa.ec | `Admin#2024` |
| Recepcionista | recepcion@sonrisa.ec | `Recepcion#2024` |
| Odontólogo | odontologo@sonrisa.ec | `Odontologo#2024` |
| Paciente | paciente1@sonrisa.ec | `Paciente#2024` |
| Paciente | paciente2@sonrisa.ec | `Paciente#2025` |

## 2. Iniciar sesión

1. Abre la aplicación. Verás la pantalla **Iniciar sesión**.
2. Escribe tu **correo electrónico** y tu **contraseña**.
   - La contraseña debe tener de 8 a 64 caracteres, con al menos una mayúscula, una minúscula y un número.
3. Pulsa **Ingresar**.

Qué puede pasar:

| Situación | Qué verás |
|---|---|
| Campos vacíos o con formato incorrecto | Un mensaje rojo debajo del campo |
| Correo o contraseña incorrectos | «Usuario o contraseña incorrectos» (el mensaje es el mismo exista o no el correo, por seguridad) |
| 3 intentos fallidos seguidos | «Cuenta bloqueada temporalmente». Espera **5 minutos** e inténtalo de nuevo |
| Entras fuera del horario de atención (08:00 a 18:00) | Se te permite el acceso, pero aparece un aviso y se registra una alerta |
| Paciente u odontólogo con datos correctos | Entras directo a tu página |
| Administrador o recepcionista con datos correctos | Pasas a la **verificación en dos pasos** (sección 3) |

Para salir, pulsa **Cerrar sesión** en la esquina superior derecha. La sesión también termina al cerrar la pestaña.

## 3. Verificación en dos pasos (MFA)

Solo para **administrador** y **recepcionista**. Después de escribir la contraseña correcta aparece la pantalla **Verificación en dos pasos**.

> **Es una simulación.** No se envía ningún SMS ni correo. El código aparece en la propia pantalla, dentro del recuadro morado «Dispositivo simulado / Correo simulado», que representa el celular o el correo del usuario.

1. Mira el recuadro morado: ahí está tu **código de 6 dígitos**.
2. Escríbelo en el campo **Código de 6 dígitos**.
3. Pulsa **Verificar**.

Reglas del código:

- **Vence a los 2 minutos.** La pantalla muestra la cuenta regresiva en «Vence en».
- Tienes **3 intentos**. La pantalla muestra cuántos te quedan en «Intentos restantes».
- Si escribes menos de 6 dígitos o letras, la pantalla te lo indica y **no** gasta un intento.

| Situación | Qué ocurre |
|---|---|
| Código correcto | Entras a tu página (recepcionista: agenda; administrador: registro de eventos) |
| Código incorrecto | «Código incorrecto. Quedan N intento(s).» |
| Tres códigos incorrectos | «Se agotaron los intentos. El inicio de sesión fue cancelado.» Se genera una **alerta de seguridad** y debes volver a ingresar tu contraseña |
| Pasaron más de 2 minutos | «El código expiró.» Vuelve a iniciar sesión para recibir uno nuevo |
| Quieres volver atrás | Pulsa **Cancelar y volver al inicio de sesión** |

No puedes saltarte este paso: si tras la contraseña intentas abrir otra página escribiendo su dirección, la aplicación te devuelve al inicio de sesión.

## 4. Paciente

Al entrar ves **Mis citas**, con solo tus propias citas.

**Solicitar una cita**
1. Pulsa **+ Solicitar cita**.
2. Elige la **fecha** (desde hoy), la **hora** y escribe el **motivo** (por ejemplo, «Dolor de muela»).
3. Pulsa **Confirmar solicitud**. Si falta algún dato aparece un aviso.

**Cancelar una cita**
- En la tarjeta de la cita pulsa **Cancelar**. La cita queda con estado «Cancelada».

Cada cita muestra su fecha y hora, el odontólogo, el motivo y su estado (Pendiente, Confirmada o Cancelada).

## 5. Odontólogo

Al entrar ves **Agenda de hoy** con las citas del día actual asignadas a ti. Si no tienes ninguna, aparece «No tiene citas programadas para hoy.» Esta vista es de consulta.

## 6. Recepcionista

Después del MFA ves la **Agenda general** con todas las citas.

**Registrar una cita**
1. Pulsa **+ Nueva cita**.
2. Elige el **paciente**, la **fecha**, la **hora** y el **motivo**.
3. Pulsa **Guardar cita**.

**Reprogramar una cita**
1. En la fila de la cita cambia la fecha y la hora.
2. Pulsa **Reprogramar**.

**Cancelar una cita**
- Pulsa **Cancelar** en la fila de la cita.

La recepcionista **no** tiene acceso al registro de eventos de seguridad. Si intenta abrirlo, la aplicación la devuelve a la agenda y queda registrado el intento.

## 7. Administrador

Después del MFA entras al **Registro de eventos**. Desde la barra superior accedes a **Simulador de incidentes** y a **Pruebas automatizadas**. El administrador **no** ve la agenda de citas.

### 7.1 Registro de eventos

- **Tarjetas resumen:** total de eventos, logins exitosos, logins fallidos, bloqueos y alertas activas.
- **Alertas activas:** en rojo las de nivel ALTO y en naranja las de nivel MEDIO. Pulsa **Marcar como revisada** cuando la hayas atendido; la alerta desaparece de la lista pero el registro conserva el evento original y agrega uno de revisión.
- **Filtros:** por usuario (texto), rol, acción, resultado y rango de fechas. **Limpiar filtros** vuelve a mostrar todo.
- **Exportar registro (.json):** descarga el registro completo con el nombre `dentacita_logs_AAAA-MM-DD.json`.

El registro es de solo lectura: no se pueden editar ni borrar eventos desde la pantalla.

### 7.2 Simulador de incidentes

La pantalla muestra el aviso **MODO SIMULACIÓN – entorno académico**. Cada botón crea eventos de ejemplo (marcados «SIMULADO») y muestra las alertas que detecta el sistema:

| Botón | Qué simula |
|---|---|
| Escenario 1 | Ataque de fuerza bruta contra la recepcionista |
| Escenario 2 | Ingreso de la recepcionista a las 23:40 |
| Escenario 3 | Un paciente intenta abrir páginas del administrador |
| Escenario 4 | Pruebas con 4 correos que no existen |

**Borrar eventos simulados** elimina únicamente los eventos simulados; los reales no se tocan.

### 7.3 Pruebas automatizadas

Al abrir la página se ejecutan solas 27 pruebas (login, control de acceso por rol, MFA, escenarios del simulador y casos de actividad normal). Verás:

- **Fecha, hora y navegador** de la ejecución (útiles como evidencia).
- **Seis métricas:** porcentaje de casos superados, tasa de detección de las reglas, falsos positivos, tiempo promedio de login, tiempo de hash SHA-256 frente a PBKDF2 y tiempo de verificación del MFA.
- **Tabla de casos** con el resultado esperado, el obtenido y el veredicto **CUMPLE** o **NO CUMPLE**.
- Botones **Volver a ejecutar**, **Exportar JSON** y **Exportar CSV**.

Las pruebas **no alteran tu registro real**: lo respaldan antes de empezar y lo restauran al terminar. Solo queda un evento `PRUEBAS_EJECUTADAS` con el resumen. Para abrir el CSV en Excel, usa *Datos → Obtener datos → Desde texto/CSV* y elige «UTF-8».

Mientras corren las pruebas no cierres ni recargues la pestaña. Si ocurre, el registro y los bloqueos reales se recuperan al volver a abrir la página, pero tendrás que iniciar sesión de nuevo.

## 8. Preguntas frecuentes

**¿Por qué me aparece «Cuenta bloqueada temporalmente»?**
Fallaste la contraseña 3 veces seguidas con ese correo. Espera 5 minutos.

**El código MFA dejó de funcionar.**
Venció (2 minutos) o agotaste los 3 intentos. Vuelve a ingresar tu contraseña para recibir uno nuevo.

**¿Dónde llegó el código?**
A ningún lugar: es una simulación. Está en el recuadro morado de la misma pantalla.

**No puedo abrir una página escribiendo su dirección.**
Cada página solo permite ciertos roles. Si no corresponde al tuyo, la aplicación te lleva a tu página de inicio y deja constancia del intento.

**¿Se guardan mis datos en un servidor?**
No. Todo queda en tu navegador, por lo que otra persona o navegador no verá tus citas. Para empezar de cero, borra los datos del sitio desde las herramientas del navegador (F12 → Application → Clear site data).

**Veo el mensaje «No se pudo conectar con el sistema».**
Si usas la aplicación desde tu computadora, debe abrirse con un servidor local (por ejemplo, Live Server), no con doble clic en el archivo. En la versión en línea no debería ocurrir.
