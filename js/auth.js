/**
 * auth.js
 * -----------------------------------------------------------
 * Logica de autenticacion, control de sesion y control de acceso
 * por rol de DentaCita.
 *
 * Depende de:
 *   - js/validacion.js  (limpiarEspacios)
 *   - js/logs.js        (registrarEvento, ACCIONES)
 *
 * Debe cargarse despues de esos dos archivos en cada pagina HTML.
 * -----------------------------------------------------------
 */

const RUTA_USUARIOS = "data/usuarios.json";
const CLAVE_SESION = "dentacita_sesion";
const CLAVE_BLOQUEOS = "dentacita_bloqueos";

const MAX_INTENTOS = 3;
const MINUTOS_BLOQUEO = 5;
const HORA_APERTURA = 8;  // 08:00
const HORA_CIERRE = 18;   // 18:00

// Hash "senuelo" usado cuando el correo no existe, para que el
// tiempo de respuesta sea similar al de un usuario real y no se
// pueda deducir por temporizacion si un correo esta registrado.
const HASH_SENUELO =
    "0".repeat(64);

/**
 * Calcula el hash SHA-256 de un texto usando la Web Crypto API
 * y lo devuelve como cadena hexadecimal en minusculas.
 */
async function calcularHashSHA256(texto) {
    const codificador = new TextEncoder();
    const datos = codificador.encode(texto);
    const bufferHash = await crypto.subtle.digest("SHA-256", datos);
    const bytes = Array.from(new Uint8Array(bufferHash));
    return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Carga la lista de usuarios de prueba desde data/usuarios.json.
 * Requiere ejecutar el proyecto con Live Server (o cualquier
 * servidor local), ya que fetch() no funciona con file://
 */
async function cargarUsuarios() {
    const respuesta = await fetch(RUTA_USUARIOS);
    if (!respuesta.ok) {
        throw new Error("No se pudo cargar la lista de usuarios");
    }
    return respuesta.json();
}

// ----------------------------------------------------------------
// Control de bloqueo por intentos fallidos
// ----------------------------------------------------------------

function obtenerMapaBloqueos() {
    try {
        const datos = localStorage.getItem(CLAVE_BLOQUEOS);
        return datos ? JSON.parse(datos) : {};
    } catch (error) {
        return {};
    }
}

function guardarMapaBloqueos(mapa) {
    localStorage.setItem(CLAVE_BLOQUEOS, JSON.stringify(mapa));
}

/**
 * Devuelve el estado de bloqueo de un correo:
 * { intentos: number, bloqueadoHasta: number|null }
 */
function obtenerEstadoBloqueo(correo) {
    const mapa = obtenerMapaBloqueos();
    return mapa[correo] || { intentos: 0, bloqueadoHasta: null };
}

function guardarEstadoBloqueo(correo, estado) {
    const mapa = obtenerMapaBloqueos();
    mapa[correo] = estado;
    guardarMapaBloqueos(mapa);
}

/**
 * Verifica si la cuenta esta actualmente bloqueada. Si el tiempo
 * de bloqueo ya vencio, limpia el estado automaticamente.
 */
function estaBloqueada(correo) {
    const estado = obtenerEstadoBloqueo(correo);
    if (estado.bloqueadoHasta && Date.now() < estado.bloqueadoHasta) {
        return true;
    }
    if (estado.bloqueadoHasta && Date.now() >= estado.bloqueadoHasta) {
        // El bloqueo ya expiro: se reinicia el contador.
        guardarEstadoBloqueo(correo, { intentos: 0, bloqueadoHasta: null });
    }
    return false;
}

// ----------------------------------------------------------------
// Horario de atencion
// ----------------------------------------------------------------

/**
 * Indica si la hora actual esta fuera del horario de atencion
 * (antes de las 08:00 o despues de las 18:00).
 */
function esFueraDeHorario() {
    const horaActual = new Date().getHours();
    return horaActual < HORA_APERTURA || horaActual >= HORA_CIERRE;
}

// ----------------------------------------------------------------
// Inicio de sesion
// ----------------------------------------------------------------

/**
 * Intenta iniciar sesion con el correo y contrasena dados.
 * Se asume que ya pasaron por validarCorreo/validarContrasena.
 *
 * @returns {Promise<{exito: boolean, mensaje: string, fueraDeHorario?: boolean}>}
 */
async function iniciarSesion(correoIngresado, contrasenaIngresada) {
    const correo = limpiarEspacios(correoIngresado).toLowerCase();
    const contrasena = limpiarEspacios(contrasenaIngresada);

    // 1. Verificar si la cuenta esta bloqueada por intentos fallidos.
    if (estaBloqueada(correo)) {
        registrarEvento(correo, "desconocido", ACCIONES.CUENTA_BLOQUEADA,
            "FALLO", "Intento de acceso mientras la cuenta esta bloqueada");
        return { exito: false, mensaje: "Cuenta bloqueada temporalmente" };
    }

    // 2. Cargar usuarios y buscar coincidencia por correo.
    const usuarios = await cargarUsuarios();
    const usuario = usuarios.find(
        (u) => u.correo.toLowerCase() === correo
    );

    // 3. Calcular el hash de la contrasena ingresada. Esto se hace
    //    siempre, exista o no el usuario, para no dar pistas por
    //    diferencias de tiempo de respuesta.
    const hashIngresado = await calcularHashSHA256(contrasena);
    const hashEsperado = usuario ? usuario.hashContrasena : HASH_SENUELO;
    const coincide = usuario && hashIngresado === hashEsperado;

    if (coincide) {
        // Login correcto: reiniciar contador de intentos.
        guardarEstadoBloqueo(correo, { intentos: 0, bloqueadoHasta: null });

        // Guardar la sesion activa (nunca se guarda la contrasena).
        const sesion = {
            correo: usuario.correo,
            nombre: usuario.nombre,
            rol: usuario.rol
        };
        sessionStorage.setItem(CLAVE_SESION, JSON.stringify(sesion));

        registrarEvento(usuario.correo, usuario.rol, ACCIONES.LOGIN_EXITOSO,
            "EXITO", "Inicio de sesión correcto");

        // Si el ingreso ocurre fuera del horario de atencion, se
        // permite pero se genera una alerta en el registro.
        const fueraDeHorario = esFueraDeHorario();
        if (fueraDeHorario) {
            registrarEvento(usuario.correo, usuario.rol,
                ACCIONES.ACCESO_FUERA_HORARIO, "ALERTA",
                "Inicio de sesión fuera del horario de atención (08:00-18:00)");
        }

        return { exito: true, mensaje: "Inicio de sesión correcto", fueraDeHorario };
    }

    // 4. Login incorrecto: incrementar contador de intentos.
    const estado = obtenerEstadoBloqueo(correo);
    const intentos = estado.intentos + 1;

    if (intentos >= MAX_INTENTOS) {
        const bloqueadoHasta = Date.now() + MINUTOS_BLOQUEO * 60 * 1000;
        guardarEstadoBloqueo(correo, { intentos, bloqueadoHasta });
        registrarEvento(correo, "desconocido", ACCIONES.CUENTA_BLOQUEADA,
            "FALLO", "Cuenta bloqueada tras " + intentos + " intentos fallidos");
        return { exito: false, mensaje: "Cuenta bloqueada temporalmente" };
    }

    guardarEstadoBloqueo(correo, { intentos, bloqueadoHasta: null });
    registrarEvento(correo, "desconocido", ACCIONES.LOGIN_FALLIDO,
        "FALLO", "Intento " + intentos + " de " + MAX_INTENTOS);

    return { exito: false, mensaje: "Usuario o contraseña incorrectos" };
}

// ----------------------------------------------------------------
// Sesion y control de acceso por rol
// ----------------------------------------------------------------

/**
 * Devuelve los datos de la sesion activa, o null si no hay sesion.
 */
function obtenerSesion() {
    try {
        const datos = sessionStorage.getItem(CLAVE_SESION);
        return datos ? JSON.parse(datos) : null;
    } catch (error) {
        return null;
    }
}

/**
 * Cierra la sesion actual, registra el evento y redirige al login.
 */
function cerrarSesion() {
    const sesion = obtenerSesion();
    if (sesion) {
        registrarEvento(sesion.correo, sesion.rol, ACCIONES.LOGOUT,
            "EXITO", "Cierre de sesión");
    }
    sessionStorage.removeItem(CLAVE_SESION);
    window.location.href = "index.html";
}

/**
 * Protege una pagina interna: exige que exista una sesion activa y
 * que el rol de esa sesion este dentro de los roles permitidos.
 * Si no se cumple, registra ACCESO_DENEGADO y redirige.
 *
 * Se debe llamar al inicio de cada pagina protegida, por ejemplo:
 *   const sesion = verificarAcceso(["recepcionista"]);
 *
 * @param {string[]} rolesPermitidos
 * @returns {object} los datos de la sesion, si el acceso es valido
 */
function verificarAcceso(rolesPermitidos) {
    const sesion = obtenerSesion();
    const paginaActual = window.location.pathname.split("/").pop();

    if (!sesion) {
        // No hay sesion activa: se redirige al login sin registrar
        // evento (no hay usuario identificado todavia).
        window.location.href = "index.html";
        return null;
    }

    if (!rolesPermitidos.includes(sesion.rol)) {
        registrarEvento(sesion.correo, sesion.rol, ACCIONES.ACCESO_DENEGADO,
            "FALLO", "Intento de acceso no autorizado a " + paginaActual);
        // Se redirige a la pagina que si le corresponde a su rol.
        window.location.href = paginaInicioPorRol(sesion.rol);
        return null;
    }

    return sesion;
}

/**
 * Devuelve la pagina de inicio que corresponde a cada rol:
 * el administrador solo trabaja con el registro de eventos y el resto
 * de roles con la agenda de citas.
 *
 * @param {string} rol
 * @returns {string}
 */
function paginaInicioPorRol(rol) {
    return rol === "administrador" ? "panel-logs.html" : "citas.html";
}

/**
 * Coloca el boton "Cerrar sesión" (y el nombre del usuario) en el
 * elemento con id "barra-sesion" de la pagina actual, si existe.
 */
function pintarBarraSesion(sesion) {
    const contenedor = document.getElementById("barra-sesion");
    if (!contenedor) return;

    contenedor.innerHTML = "";

    const spanNombre = document.createElement("span");
    spanNombre.className = "sesion-nombre";
    // Se usa textContent (nunca innerHTML) para evitar XSS con datos
    // que provienen del "backend" simulado (usuarios.json).
    spanNombre.textContent = sesion.nombre + " (" + sesion.rol + ")";

    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "boton-secundario";
    boton.textContent = "Cerrar sesión";
    boton.addEventListener("click", cerrarSesion);

    contenedor.appendChild(spanNombre);
    contenedor.appendChild(boton);
}
