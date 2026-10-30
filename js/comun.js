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

/**
 * Muestra un mensaje en el elemento con id "mensaje-formulario" (login y
 * verificacion MFA). Usa textContent: nunca innerHTML con texto dinamico.
 *
 * @param {string} texto Mensaje a mostrar
 * @param {"error"|"alerta"|"exito"} tipo Estilo del mensaje
 */
function mostrarMensajeFormulario(texto, tipo) {
    const mensaje = document.getElementById("mensaje-formulario");
    mensaje.textContent = texto;
    mensaje.className = "mensaje-formulario " + tipo;
}

/**
 * Descarga un archivo generado en el navegador (sin servidor).
 *
 * @param {string} nombre Nombre del archivo, por ejemplo "registro.json"
 * @param {string} contenido Texto del archivo
 * @param {string} tipo Tipo MIME, por ejemplo "application/json"
 */
function descargarArchivo(nombre, contenido, tipo) {
    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(new Blob([contenido], { type: tipo }));
    enlace.download = nombre;
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
    URL.revokeObjectURL(enlace.href);
}
