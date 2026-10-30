/**
 * mfa.js
 * -----------------------------------------------------------
 * Autenticacion multifactor (MFA) SIMULADA de DentaCita.
 *
 * Es obligatoria para los roles administrador y recepcionista. Despues de
 * validar la contrasena se genera un codigo de 6 digitos que NO se envia a
 * ningun lado: mfa.html lo muestra en un panel rotulado "Dispositivo
 * simulado / Correo simulado" que representa el celular o el correo del
 * usuario. El codigo vence a los 2 minutos y permite 3 intentos.
 *
 * La sesion NO existe hasta que el codigo se verifica: mientras tanto solo
 * hay un "desafio pendiente" en sessionStorage. Por eso citas.html,
 * panel-logs.html y las demas paginas protegidas redirigen al login.
 *
 * Eventos que registra: MFA_ENVIADO, MFA_EXITOSO, MFA_FALLIDO y
 * MFA_EXPIRADO (nunca el codigo). 3 MFA_FALLIDO seguidos generan una
 * alerta ALTO (ver js/logs.js).
 *
 * Depende de: js/validacion.js (limpiarEspacios), js/logs.js
 * (registrarEvento, ACCIONES) y js/auth.js (crearSesion, compararSeguro).
 * -----------------------------------------------------------
 */

const CLAVE_MFA = "dentacita_mfa_pendiente";

// Roles que deben superar el MFA para iniciar sesion.
const ROLES_CON_MFA = ["administrador", "recepcionista"];

const MFA_VIGENCIA_MS = 2 * 60 * 1000;   // el codigo vence a los 2 minutos
const MFA_MAX_INTENTOS = 3;              // intentos permitidos por codigo
const MFA_LONGITUD_CODIGO = 6;

/**
 * Indica si un rol esta obligado a pasar por MFA.
 *
 * @param {string} rol
 * @returns {boolean}
 */
function rolRequiereMFA(rol) {
    return ROLES_CON_MFA.includes(rol);
}

/**
 * Genera un codigo numerico de 6 digitos con crypto.getRandomValues.
 * Se descartan los valores que producirian sesgo al aplicar el modulo, asi
 * los 1 000 000 de codigos posibles son equiprobables.
 *
 * @returns {string} codigo de 6 digitos (puede empezar con ceros)
 */
function generarCodigoMFA() {
    const combinaciones = Math.pow(10, MFA_LONGITUD_CODIGO);
    const limite = Math.floor(4294967296 / combinaciones) * combinaciones;
    const buffer = new Uint32Array(1);
    let valor;
    do {
        crypto.getRandomValues(buffer);
        valor = buffer[0];
    } while (valor >= limite);
    return String(valor % combinaciones).padStart(MFA_LONGITUD_CODIGO, "0");
}

/**
 * Devuelve el desafio MFA pendiente de la pestana actual, o null si no hay.
 * Forma: { correo, nombre, rol, codigo, creado, vence, intentosRestantes }
 *
 * @returns {object|null}
 */
function obtenerDesafioMFA() {
    try {
        const datos = sessionStorage.getItem(CLAVE_MFA);
        const desafio = datos ? JSON.parse(datos) : null;
        return desafio && desafio.correo && desafio.codigo ? desafio : null;
    } catch (error) {
        return null;
    }
}

/**
 * Descarta el desafio pendiente (el usuario cancelo o se agoto).
 */
function cancelarDesafioMFA() {
    sessionStorage.removeItem(CLAVE_MFA);
}

/**
 * Crea un desafio MFA para un usuario cuya contrasena ya fue validada y
 * registra MFA_ENVIADO. NO crea la sesion.
 *
 * @param {{correo: string, nombre: string, rol: string}} usuario
 * @returns {object} el desafio creado
 */
function iniciarDesafioMFA(usuario) {
    const ahora = Date.now();
    const desafio = {
        correo: usuario.correo,
        nombre: usuario.nombre,
        rol: usuario.rol,
        codigo: generarCodigoMFA(),
        creado: ahora,
        vence: ahora + MFA_VIGENCIA_MS,
        intentosRestantes: MFA_MAX_INTENTOS
    };
    sessionStorage.setItem(CLAVE_MFA, JSON.stringify(desafio));

    registrarEvento(usuario.correo, usuario.rol, ACCIONES.MFA_ENVIADO, "EXITO",
        "Código MFA generado (SIMULACIÓN), vigencia de 2 minutos y 3 intentos");
    return desafio;
}

/**
 * Si el desafio pendiente ya vencio, lo descarta y registra MFA_EXPIRADO.
 * Es seguro llamarla varias veces: el evento se registra una sola vez.
 *
 * @returns {boolean} true si el desafio estaba vencido
 */
function expirarDesafioSiVencido() {
    const desafio = obtenerDesafioMFA();
    if (!desafio || Date.now() < desafio.vence) return false;

    cancelarDesafioMFA();
    registrarEvento(desafio.correo, desafio.rol, ACCIONES.MFA_EXPIRADO, "FALLO",
        "Código MFA expirado sin ser verificado");
    return true;
}

/**
 * Verifica el codigo ingresado contra el desafio pendiente.
 *
 * Estados posibles:
 *   OK          codigo correcto: se registra MFA_EXITOSO y se crea la sesion
 *   INCORRECTO  codigo erroneo, quedan intentos (MFA_FALLIDO)
 *   AGOTADO     tercer error: se cancela el inicio de sesion (MFA_FALLIDO)
 *   EXPIRADO    paso mas de 2 minutos (MFA_EXPIRADO)
 *   SIN_DESAFIO no hay codigo pendiente
 *
 * @param {string} codigoIngresado
 * @returns {{estado: string, intentosRestantes?: number, rol?: string, fueraDeHorario?: boolean}}
 */
function verificarCodigoMFA(codigoIngresado) {
    const desafio = obtenerDesafioMFA();
    if (!desafio) return { estado: "SIN_DESAFIO" };

    if (expirarDesafioSiVencido()) return { estado: "EXPIRADO" };

    const codigo = limpiarEspacios(String(codigoIngresado || ""));
    const formatoValido = new RegExp("^\\d{" + MFA_LONGITUD_CODIGO + "}$").test(codigo);

    if (formatoValido && compararSeguro(codigo, desafio.codigo)) {
        cancelarDesafioMFA();
        registrarEvento(desafio.correo, desafio.rol, ACCIONES.MFA_EXITOSO, "EXITO",
            "Código MFA verificado correctamente");
        const resultado = crearSesion(desafio);
        return { estado: "OK", rol: desafio.rol, fueraDeHorario: resultado.fueraDeHorario };
    }

    desafio.intentosRestantes -= 1;

    if (desafio.intentosRestantes <= 0) {
        cancelarDesafioMFA();
        registrarEvento(desafio.correo, desafio.rol, ACCIONES.MFA_FALLIDO, "FALLO",
            "Código MFA incorrecto; intentos agotados, inicio de sesión cancelado");
        return { estado: "AGOTADO", intentosRestantes: 0 };
    }

    sessionStorage.setItem(CLAVE_MFA, JSON.stringify(desafio));
    registrarEvento(desafio.correo, desafio.rol, ACCIONES.MFA_FALLIDO, "FALLO",
        "Código MFA incorrecto; quedan " + desafio.intentosRestantes + " intento(s)");
    return { estado: "INCORRECTO", intentosRestantes: desafio.intentosRestantes };
}
