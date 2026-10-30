/**
 * comun.js
 * -----------------------------------------------------------
 * Constantes y utilidades compartidas por todos los modulos de
 * DentaCita. Se carga PRIMERO en cada pagina, antes que validacion.js,
 * logs.js y auth.js, para evitar repetir estas definiciones.
 *
 * No depende de ningun otro archivo del proyecto.
 * -----------------------------------------------------------
 */

// Clave de sessionStorage donde se guarda la sesion activa.
const CLAVE_SESION = "dentacita_sesion";

// Horario de atencion del consultorio (hora local, 24 h).
const HORA_APERTURA = 8;   // 08:00
const HORA_CIERRE = 18;    // 18:00

/**
 * Genera un identificador unico con un prefijo, por ejemplo
 * "EVT-lq3k9x2a-1f9c0a7d3b21". Combina la marca de tiempo con bytes
 * aleatorios criptograficos (crypto.getRandomValues).
 *
 * @param {string} prefijo Texto que identifica el tipo de id (EVT, SES, SIM...)
 * @returns {string} id unico
 */
function generarId(prefijo) {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    const aleatorio = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return prefijo + "-" + Date.now().toString(36) + "-" + aleatorio;
}

/**
 * Indica si una fecha/hora cae fuera del horario de atencion
 * (antes de las 08:00 o desde las 18:00).
 *
 * @param {Date} [fecha] Momento a evaluar; por defecto, ahora.
 * @returns {boolean}
 */
function esFueraDeHorario(fecha) {
    const hora = (fecha || new Date()).getHours();
    return hora < HORA_APERTURA || hora >= HORA_CIERRE;
}

/**
 * Da formato AAAA-MM-DD a una fecha usando la zona horaria local.
 *
 * @param {Date} fecha
 * @returns {string}
 */
function formatearFecha(fecha) {
    const dd = String(fecha.getDate()).padStart(2, "0");
    const mm = String(fecha.getMonth() + 1).padStart(2, "0");
    return fecha.getFullYear() + "-" + mm + "-" + dd;
}

/**
 * Fecha local de hoy con formato AAAA-MM-DD.
 *
 * @returns {string}
 */
function fechaDeHoy() {
    return formatearFecha(new Date());
}
