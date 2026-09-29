/**
 * logs.js
 * -----------------------------------------------------------
 * Registro de eventos de seguridad del sistema (version inicial).
 *
 * Los eventos se guardan en localStorage bajo la clave
 * "dentacita_logs" como un arreglo de objetos. Cada objeto tiene:
 *   { fecha_hora, usuario, rol, accion, resultado, detalle }
 *
 * IMPORTANTE: nunca se registra la contrasena del usuario, ni en
 * texto plano ni en hash.
 *
 * Esta version solo guarda y lista los eventos. Queda preparada
 * para una siguiente etapa donde se agregaran:
 *   - Filtros (por usuario, rol, accion, rango de fechas)
 *   - Alertas visuales para eventos criticos (bloqueos, accesos
 *     denegados, accesos fuera de horario)
 *   - Exportacion del registro a un archivo JSON
 * -----------------------------------------------------------
 */

const CLAVE_LOGS = "dentacita_logs";

// Catalogo de acciones reconocidas por el sistema.
// Se deja como referencia y para validar valores al registrar.
const ACCIONES = {
    LOGIN_EXITOSO: "LOGIN_EXITOSO",
    LOGIN_FALLIDO: "LOGIN_FALLIDO",
    CUENTA_BLOQUEADA: "CUENTA_BLOQUEADA",
    ACCESO_FUERA_HORARIO: "ACCESO_FUERA_HORARIO",
    ACCESO_DENEGADO: "ACCESO_DENEGADO",
    LOGOUT: "LOGOUT",
    CITA_CREADA: "CITA_CREADA",
    CITA_CANCELADA: "CITA_CANCELADA"
};

/**
 * Registra un evento en el localStorage.
 *
 * @param {string} usuario  Correo del usuario (o "desconocido" si no aplica)
 * @param {string} rol      Rol del usuario (paciente/recepcionista/odontologo/desconocido)
 * @param {string} accion   Una de las constantes de ACCIONES
 * @param {string} resultado "EXITO" | "FALLO" | "ALERTA" (texto libre corto)
 * @param {string} detalle  Descripcion breve, sin datos sensibles
 */
function registrarEvento(usuario, rol, accion, resultado, detalle) {
    const evento = {
        fecha_hora: new Date().toISOString(),
        usuario: usuario || "desconocido",
        rol: rol || "desconocido",
        accion: accion,
        resultado: resultado,
        detalle: detalle || ""
    };

    const eventos = obtenerEventos();
    eventos.push(evento);

    try {
        localStorage.setItem(CLAVE_LOGS, JSON.stringify(eventos));
    } catch (error) {
        // Si localStorage falla (por ejemplo, esta lleno), no
        // interrumpimos el flujo de la aplicacion por un error de log.
        console.error("No se pudo guardar el evento de registro:", error);
    }
}

/**
 * Devuelve todos los eventos guardados, ordenados del mas reciente
 * al mas antiguo. Si no hay eventos, devuelve un arreglo vacio.
 */
function obtenerEventos() {
    try {
        const datos = localStorage.getItem(CLAVE_LOGS);
        const eventos = datos ? JSON.parse(datos) : [];
        return Array.isArray(eventos) ? eventos : [];
    } catch (error) {
        console.error("No se pudo leer el registro de eventos:", error);
        return [];
    }
}

/**
 * Punto de extension para una futura exportacion a archivo JSON.
 * Por ahora solo devuelve el texto JSON listo para descargar.
 */
function exportarEventosComoJSON() {
    return JSON.stringify(obtenerEventos(), null, 2);
}
