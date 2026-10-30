/**
 * auth.js
 * -----------------------------------------------------------
 * Logica de autenticacion, control de sesion y control de acceso
 * por rol de DentaCita.
 *
 * Depende de:
 *   - js/comun.js       (CLAVE_SESION, generarId, esFueraDeHorario)
 *   - js/validacion.js  (limpiarEspacios)
 *   - js/logs.js        (registrarEvento, ACCIONES)
 *
 * Debe cargarse despues de esos archivos en cada pagina HTML.
 * -----------------------------------------------------------
 */

const RUTA_USUARIOS = "data/usuarios.json";
const CLAVE_BLOQUEOS = "dentacita_bloqueos";

const MAX_INTENTOS = 3;
const MINUTOS_BLOQUEO = 5;

// Roles que pueden abrir cada pagina protegida. Cada pagina llama a
// verificarAcceso(ROLES_POR_PAGINA["nombre.html"]) y pruebas.html usa esta
// misma tabla para comprobar el control de acceso real.
const ROLES_POR_PAGINA = {
    "citas.html": ["paciente", "recepcionista", "odontologo"],
    "panel-logs.html": ["administrador"],
    "simulador.html": ["administrador"],
    "pruebas.html": ["administrador"]
};

// ----------------------------------------------------------------
// Almacenamiento de contrasenas: PBKDF2-SHA256 con sal por usuario
// ----------------------------------------------------------------

const ALGORITMO_HASH = "PBKDF2-SHA256";
const ITERACIONES_PBKDF2 = 150000;       // iteraciones usadas para nuevos hashes y para el senuelo
const ITERACIONES_MINIMAS = 100000;      // un usuario con menos iteraciones se rechaza
const BITS_HASH = 256;                   // longitud del hash derivado (32 bytes)

// Sal "senuelo" usada cuando el correo no existe: se deriva igual que para
// un usuario real, asi el tiempo de respuesta no delata si el correo esta
// registrado (mitigacion de ataques de temporizacion).
const SAL_SENUELO = "00".repeat(16);

/**
 * Convierte bytes a una cadena hexadecimal en minusculas.
 *
 * @param {Uint8Array|number[]} bytes
 * @returns {string}
 */
function bytesAHex(bytes) {
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Convierte una cadena hexadecimal en bytes.
 *
 * @param {string} hex Cadena de longitud par (por ejemplo, la sal de usuarios.json)
 * @returns {Uint8Array}
 */
function hexABytes(hex) {
    const pares = hex.match(/.{2}/g) || [];
    return new Uint8Array(pares.map((par) => parseInt(par, 16)));
}

/**
 * Deriva un hash con PBKDF2-SHA256 usando la Web Crypto API.
 *
 * @param {string} contrasena Contrasena en texto plano (nunca se guarda)
 * @param {string} salHex Sal unica del usuario, en hexadecimal
 * @param {number} iteraciones Cantidad de iteraciones de PBKDF2
 * @returns {Promise<string>} hash derivado en hexadecimal
 */
async function derivarHashPBKDF2(contrasena, salHex, iteraciones) {
    const material = await crypto.subtle.importKey(
        "raw", new TextEncoder().encode(contrasena), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", hash: "SHA-256", salt: hexABytes(salHex), iterations: iteraciones },
        material, BITS_HASH);
    return bytesAHex(new Uint8Array(bits));
}

/**
 * Calcula el hash SHA-256 simple de un texto (sin sal ni iteraciones).
 * Ya NO se usa para contrasenas; se conserva solo para que pruebas.html
 * pueda comparar su tiempo con el de PBKDF2.
 *
 * @param {string} texto
 * @returns {Promise<string>} hash en hexadecimal
 */
async function calcularHashSHA256(texto) {
    const bufferHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
    return bytesAHex(new Uint8Array(bufferHash));
}

/**
 * Compara dos cadenas recorriendo siempre toda la longitud, para que el
 * tiempo de comparacion no revele en que posicion difieren.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function compararSeguro(a, b) {
    if (a.length !== b.length) return false;
    let diferencia = 0;
    for (let i = 0; i < a.length; i++) {
        diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diferencia === 0;
}

/**
 * Verifica una contrasena contra el registro de un usuario. Si el usuario
 * no existe (null) se deriva igualmente con la sal senuelo y se devuelve
 * false, para que el tiempo de respuesta sea el mismo.
 *
 * @param {string} contrasena
 * @param {object|null} usuario Registro de data/usuarios.json o null
 * @returns {Promise<boolean>}
 */
async function verificarContrasena(contrasena, usuario) {
    if (!usuario || usuario.algoritmo !== ALGORITMO_HASH || usuario.iteraciones < ITERACIONES_MINIMAS) {
        await derivarHashPBKDF2(contrasena, SAL_SENUELO, ITERACIONES_PBKDF2);
        return false;
    }
    const hash = await derivarHashPBKDF2(contrasena, usuario.sal, usuario.iteraciones);
    return compararSeguro(hash, usuario.hashContrasena);
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
// Inicio de sesion
// ----------------------------------------------------------------

/**
 * Crea la sesion activa de un usuario ya autenticado y registra
 * LOGIN_EXITOSO (y ACCESO_FUERA_HORARIO si corresponde). Se llama al validar
 * la contrasena (paciente y odontologo) o al superar el MFA (administrador y
 * recepcionista). Nunca se guarda la contrasena en la sesion.
 *
 * @param {{correo: string, nombre: string, rol: string}} usuario
 * @returns {{sesion: object, fueraDeHorario: boolean}}
 */
function crearSesion(usuario) {
    // El id de sesion permite agrupar eventos (regla de escalamiento de
    // privilegios); es un valor aleatorio sin relacion con la clave.
    const sesion = {
        id: generarId("SES"),
        correo: usuario.correo,
        nombre: usuario.nombre,
        rol: usuario.rol
    };
    sessionStorage.setItem(CLAVE_SESION, JSON.stringify(sesion));

    registrarEvento(usuario.correo, usuario.rol, ACCIONES.LOGIN_EXITOSO,
        "EXITO", "Inicio de sesión correcto");

    // Si el ingreso ocurre fuera del horario de atencion, se permite pero
    // se deja una alerta en el registro.
    const fueraDeHorario = esFueraDeHorario();
    if (fueraDeHorario) {
        registrarEvento(usuario.correo, usuario.rol,
            ACCIONES.ACCESO_FUERA_HORARIO, "ALERTA",
            "Inicio de sesión fuera del horario de atención (08:00-18:00)");
    }

    return { sesion, fueraDeHorario };
}

/**
 * Primer paso del login: valida bloqueo y contrasena.
 * - Paciente y odontologo: crea la sesion y termina.
 * - Administrador y recepcionista: genera el desafio MFA (requiereMFA: true)
 *   y NO crea la sesion hasta que mfa.html verifique el codigo.
 * Se asume que el correo y la contrasena ya pasaron por validarCorreo y
 * validarContrasena.
 *
 * @param {string} correoIngresado
 * @param {string} contrasenaIngresada
 * @returns {Promise<{exito: boolean, mensaje: string, requiereMFA?: boolean, fueraDeHorario?: boolean}>}
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

    // 3. Derivar el hash PBKDF2 de la contrasena ingresada. Se hace siempre,
    //    exista o no el usuario, para no dar pistas por diferencias de
    //    tiempo de respuesta.
    const coincide = await verificarContrasena(contrasena, usuario || null);

    if (coincide) {
        // Contrasena correcta: reiniciar contador de intentos.
        guardarEstadoBloqueo(correo, { intentos: 0, bloqueadoHasta: null });

        // Administrador y recepcionista deben superar el MFA: todavia NO se
        // crea la sesion, solo un desafio pendiente (ver js/mfa.js).
        if (rolRequiereMFA(usuario.rol)) {
            iniciarDesafioMFA(usuario);
            return {
                exito: true,
                mensaje: "Contraseña correcta. Falta la verificación en dos pasos",
                requiereMFA: true,
                fueraDeHorario: false
            };
        }

        const resultado = crearSesion(usuario);
        return {
            exito: true,
            mensaje: "Inicio de sesión correcto",
            requiereMFA: false,
            fueraDeHorario: resultado.fueraDeHorario
        };
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
    const paginaActual = window.location.pathname.split("/").pop();
    const decision = evaluarAcceso(rolesPermitidos, paginaActual);

    if (!decision.permitido) {
        window.location.href = decision.destino;
        return null;
    }
    return decision.sesion;
}

/**
 * Decide si la sesion actual puede entrar a una pagina, SIN redirigir.
 * Es la logica de verificarAcceso() separada de la navegacion para poder
 * probarla de forma automatica (pruebas.html).
 *
 * - Sin sesion (incluye el caso de un MFA pendiente): no permitido, destino
 *   index.html, sin registrar evento (aun no hay usuario identificado).
 * - Con sesion y rol no permitido: registra ACCESO_DENEGADO y manda a la
 *   pagina de inicio de su rol.
 *
 * @param {string[]} rolesPermitidos
 * @param {string} pagina Nombre de la pagina que se intenta abrir
 * @returns {{permitido: boolean, sesion: object|null, destino: string|null, motivo: string}}
 */
function evaluarAcceso(rolesPermitidos, pagina) {
    const sesion = obtenerSesion();

    if (!sesion) {
        return { permitido: false, sesion: null, destino: "index.html", motivo: "SIN_SESION" };
    }

    if (!rolesPermitidos.includes(sesion.rol)) {
        registrarEvento(sesion.correo, sesion.rol, ACCIONES.ACCESO_DENEGADO,
            "FALLO", "Intento de acceso no autorizado a " + pagina);
        return { permitido: false, sesion, destino: paginaInicioPorRol(sesion.rol), motivo: "ROL_NO_AUTORIZADO" };
    }

    return { permitido: true, sesion, destino: null, motivo: "OK" };
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

/**
 * Agrega un enlace de navegacion en la barra de sesion, justo antes del
 * boton "Cerrar sesión". Se debe llamar despues de pintarBarraSesion.
 */
function agregarEnlaceBarra(texto, destino) {
    const contenedor = document.getElementById("barra-sesion");
    if (!contenedor) return;

    const enlace = document.createElement("a");
    enlace.href = destino;
    enlace.textContent = texto;
    enlace.className = "boton-secundario enlace";

    contenedor.insertBefore(enlace, contenedor.lastChild);
}
