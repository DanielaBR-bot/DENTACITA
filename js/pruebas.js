/**
 * pruebas.js
 * -----------------------------------------------------------
 * Motor de pruebas automatizadas de DentaCita (lo usa pruebas.html, solo
 * para el administrador).
 *
 * Ejecuta contra el codigo REAL del proyecto:
 *   - P1-P9   : login, bloqueo, XSS y control de acceso por rol
 *   - P10-P15 : autenticacion multifactor (MFA)
 *   - E1-E4   : los 4 escenarios del simulador de incidentes
 *   - F1-F7   : casos benignos para medir falsos positivos
 * y calcula metricas de calidad (cumplimiento, deteccion, falsos positivos,
 * tiempos de login, de hash y de verificacion MFA).
 *
 * AISLAMIENTO: las pruebas no tocan el registro real. Antes de empezar se
 * respalda el registro de eventos, los bloqueos, la sesion y el desafio MFA
 * (tambien en localStorage, por si la pagina se cierra a mitad de la
 * ejecucion); cada caso arranca con ese estado vacio y al terminar se
 * restaura todo tal como estaba.
 *
 * Depende de: comun.js, validacion.js, logs.js, auth.js, mfa.js y
 * simulador.js.
 * -----------------------------------------------------------
 */

// Claves que las pruebas vacian y luego restauran.
const CLAVES_LOCAL_AISLADAS = [CLAVE_LOGS, CLAVE_BLOQUEOS];
const CLAVES_SESION_AISLADAS = [CLAVE_SESION, CLAVE_MFA];

// Copia de seguridad persistente (se borra al restaurar).
const CLAVE_RESPALDO_PRUEBAS = "dentacita_respaldo_pruebas";

const RESPUESTA_GENERICA = "Usuario o contraseña incorrectos";

// Cuentas de prueba (las mismas que documenta el README).
const CUENTAS_PRUEBA = {
    paciente: { correo: "paciente1@sonrisa.ec", clave: "Paciente#2024" },
    odontologo: { correo: "odontologo@sonrisa.ec", clave: "Odontologo#2024" },
    recepcionista: { correo: "recepcion@sonrisa.ec", clave: "Recepcion#2024" },
    administrador: { correo: "admin@sonrisa.ec", clave: "Admin#2024" }
};

// Resultado esperado del control de acceso: paginas que cada rol SI puede abrir.
const PAGINAS_PERMITIDAS_ESPERADAS = {
    paciente: ["citas.html"],
    odontologo: ["citas.html"],
    recepcionista: ["citas.html"],
    administrador: ["panel-logs.html", "simulador.html", "pruebas.html"]
};

// Repeticiones usadas para promediar los tiempos.
const REPETICIONES_LOGIN = 8;
const REPETICIONES_SHA256 = 50;
const REPETICIONES_PBKDF2 = 5;
const REPETICIONES_MFA = 20;

// ----------------------------------------------------------------
// Aislamiento del estado real
// ----------------------------------------------------------------

/** Lee varias claves de un almacenamiento; las ausentes quedan en null. */
function leerClaves(almacen, claves) {
    const valores = {};
    claves.forEach((clave) => { valores[clave] = almacen.getItem(clave); });
    return valores;
}

/**
 * Escribe solo las claves permitidas; un valor null (o ausente) borra la clave.
 * Se ignoran las claves ajenas a la lista para no escribir nada inesperado.
 */
function escribirClaves(almacen, valores, clavesPermitidas) {
    clavesPermitidas.forEach((clave) => {
        const valor = valores[clave];
        if (valor === null || valor === undefined) {
            almacen.removeItem(clave);
        } else {
            almacen.setItem(clave, valor);
        }
    });
}

/** Deja vacio el estado que usan las pruebas (registro, bloqueos, sesion y MFA). */
function reiniciarEstadoPruebas() {
    CLAVES_LOCAL_AISLADAS.forEach((clave) => localStorage.removeItem(clave));
    CLAVES_SESION_AISLADAS.forEach((clave) => sessionStorage.removeItem(clave));
}

/**
 * Respalda el estado real y lo vacia. El respaldo completo (con la sesion)
 * vive solo en memoria; en localStorage se guarda unicamente una copia de los
 * DATOS (registro y bloqueos) para poder recuperarlos si la pagina se cierra a
 * mitad de la ejecucion. La sesion NUNCA se persiste: guardarla en un
 * almacenamiento compartido permitiria que otro usuario la heredara.
 *
 * @returns {{local: object, sesion: object}} el respaldo, para restaurarlo luego
 */
function tomarRespaldoPruebas() {
    const respaldo = {
        local: leerClaves(localStorage, CLAVES_LOCAL_AISLADAS),
        sesion: leerClaves(sessionStorage, CLAVES_SESION_AISLADAS)
    };
    localStorage.setItem(CLAVE_RESPALDO_PRUEBAS, JSON.stringify({ local: respaldo.local }));
    reiniciarEstadoPruebas();
    return respaldo;
}

/** Restaura el estado real a partir del respaldo en memoria y borra la copia persistente. */
function restaurarRespaldoPruebas(respaldo) {
    reiniciarEstadoPruebas();
    escribirClaves(localStorage, respaldo.local, CLAVES_LOCAL_AISLADAS);
    escribirClaves(sessionStorage, respaldo.sesion, CLAVES_SESION_AISLADAS);
    localStorage.removeItem(CLAVE_RESPALDO_PRUEBAS);
}

/**
 * Si una ejecucion anterior se interrumpio (por ejemplo, se cerro la pestana),
 * recupera el registro y los bloqueos reales y descarta cualquier sesion o
 * codigo MFA que hayan dejado las pruebas, asi que despues hay que iniciar
 * sesion de nuevo. Deja constancia en el registro. Debe llamarse al abrir
 * pruebas.html, ANTES de verificar la sesion.
 *
 * @returns {boolean} true si habia un respaldo pendiente
 */
function recuperarRespaldoPruebas() {
    try {
        const datos = localStorage.getItem(CLAVE_RESPALDO_PRUEBAS);
        if (!datos) return false;

        reiniciarEstadoPruebas();
        escribirClaves(localStorage, JSON.parse(datos).local || {}, CLAVES_LOCAL_AISLADAS);
        localStorage.removeItem(CLAVE_RESPALDO_PRUEBAS);

        registrarEvento("sistema", "sistema", ACCIONES.PRUEBAS_EJECUTADAS, "ALERTA",
            "Una ejecución de pruebas se interrumpió: se restauraron el registro y los bloqueos reales");
        return true;
    } catch (error) {
        localStorage.removeItem(CLAVE_RESPALDO_PRUEBAS);
        return false;
    }
}

// ----------------------------------------------------------------
// Entorno de ejecucion (evidencia para el informe)
// ----------------------------------------------------------------

/**
 * Nombre y version aproximados del navegador a partir del userAgent.
 *
 * @param {string} ua
 * @returns {string}
 */
function describirNavegador(ua) {
    const reglas = [
        [/Edg\/([\d.]+)/, "Microsoft Edge"],
        [/OPR\/([\d.]+)/, "Opera"],
        [/Firefox\/([\d.]+)/, "Firefox"],
        [/Chrome\/([\d.]+)/, "Google Chrome"],
        [/Version\/([\d.]+).*Safari/, "Safari"]
    ];
    for (const [patron, nombre] of reglas) {
        const coincidencia = ua.match(patron);
        if (coincidencia) return nombre + " " + coincidencia[1];
    }
    return ua;
}

/**
 * Fecha, hora y navegador de la ejecucion.
 *
 * @returns {object}
 */
function obtenerEntornoEjecucion() {
    const ahora = new Date();
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "desconocido";
    const plataforma = typeof navigator !== "undefined"
        ? ((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "")
        : "";
    return {
        fecha: fechaDeHoy(),
        hora: ahora.toLocaleTimeString("es-EC", { hour12: false }),
        fechaHoraISO: ahora.toISOString(),
        zonaHoraria: Intl.DateTimeFormat().resolvedOptions().timeZone,
        navegador: describirNavegador(ua),
        userAgent: ua,
        plataforma: plataforma,
        url: typeof location !== "undefined" ? location.href : "(sin página)"
    };
}

// ----------------------------------------------------------------
// Utilidades de las pruebas
// ----------------------------------------------------------------

/** Inicia sesion como un rol; si exige MFA, lo completa con el codigo pendiente. */
async function iniciarSesionCompleta(rol) {
    const cuenta = CUENTAS_PRUEBA[rol];
    const login = await iniciarSesion(cuenta.correo, cuenta.clave);
    let mfa = null;
    if (login.exito && login.requiereMFA) {
        mfa = verificarCodigoMFA(obtenerDesafioMFA().codigo);
    }
    return { login, mfa };
}

/** Cierra la sesion sin redirigir (cerrarSesion() navega a index.html). */
function cerrarSesionSilencioso() {
    sessionStorage.removeItem(CLAVE_SESION);
    sessionStorage.removeItem(CLAVE_MFA);
}

/** Una letra distinta para forzar un codigo MFA incorrecto. */
function codigoIncorrecto(codigoReal) {
    return codigoReal === "000000" ? "111111" : "000000";
}

function eventosPorAccion(accion) {
    return obtenerEventos().filter((e) => e.accion === accion);
}

function alertasDeRegla(regla) {
    return obtenerAlertasActivas().filter((a) => a.regla === regla);
}

function totalAlertas() {
    return eventosPorAccion(ACCIONES.ALERTA_SEGURIDAD).length;
}

/** Fecha de hoy a una hora local concreta, en formato ISO. */
function hoyA(hora, minuto, segundo) {
    const fecha = new Date();
    fecha.setHours(hora, minuto, segundo || 0, 0);
    return fecha.toISOString();
}

function mensajeSiNo(condicion) {
    return condicion ? "sí" : "NO";
}

// ----------------------------------------------------------------
// Casos de prueba
// ----------------------------------------------------------------
// Cada caso: { id, grupo, caso, esperado, ejecutar }
// ejecutar() devuelve { cumple, obtenido } y, segun el caso:
//   deteccion: true|false  (la alerta esperada se genero o no)
//   alertas: numero de alertas generadas (casos benignos)

/**
 * Lista de todos los casos automatizados.
 *
 * @returns {object[]}
 */
function definirCasos() {
    return [
        // ---------------- Login (P1-P9) ----------------
        {
            id: "P1", grupo: "Login", caso: "Formulario vacío",
            esperado: "Mensajes de validación en correo y contraseña; no se intenta autenticar (sin eventos)",
            ejecutar: async () => {
                const errorCorreo = validarCorreo("");
                const errorClave = validarContrasena("");
                const sinEventos = obtenerEventos().length === 0;
                return {
                    cumple: Boolean(errorCorreo) && Boolean(errorClave) && sinEventos,
                    obtenido: "Correo: «" + errorCorreo + "» · Contraseña: «" + errorClave + "» · eventos: " + obtenerEventos().length
                };
            }
        },
        {
            id: "P2", grupo: "Login", caso: "Correo inválido",
            esperado: "Se rechazan «abc», «a@b», «usuario@dominio», «@sonrisa.ec» y un correo de más de 60 caracteres; un correo válido se acepta",
            ejecutar: async () => {
                const invalidos = ["abc", "a@b", "usuario@dominio", "@sonrisa.ec", "x".repeat(61) + "@sonrisa.ec"];
                const rechazados = invalidos.filter((c) => validarCorreo(c) !== null).length;
                const validoAceptado = validarCorreo("paciente1@sonrisa.ec") === null;
                return {
                    cumple: rechazados === invalidos.length && validoAceptado,
                    obtenido: rechazados + " de " + invalidos.length + " correos inválidos rechazados; válido aceptado: " + mensajeSiNo(validoAceptado)
                };
            }
        },
        {
            id: "P3", grupo: "Login", caso: "Contraseña débil",
            esperado: "Se rechazan «12345678», «password», «PASSWORD1», «Abc1» y una de 65 caracteres; una contraseña fuerte se acepta",
            ejecutar: async () => {
                const debiles = ["12345678", "password", "PASSWORD1", "Abc1", "Aa1" + "x".repeat(62)];
                const rechazadas = debiles.filter((c) => validarContrasena(c) !== null).length;
                const fuerteAceptada = validarContrasena("Paciente#2024") === null;
                return {
                    cumple: rechazadas === debiles.length && fuerteAceptada,
                    obtenido: rechazadas + " de " + debiles.length + " contraseñas débiles rechazadas; fuerte aceptada: " + mensajeSiNo(fuerteAceptada)
                };
            }
        },
        {
            id: "P4", grupo: "Login", caso: "Credenciales incorrectas",
            esperado: "Mensaje genérico idéntico para correo existente e inexistente, sin sesión y con LOGIN_FALLIDO en el registro",
            ejecutar: async () => {
                const existente = await iniciarSesion(CUENTAS_PRUEBA.paciente.correo, "Incorrecta#1");
                const inexistente = await iniciarSesion("nadie@sonrisa.ec", "Incorrecta#1");
                const fallidos = eventosPorAccion(ACCIONES.LOGIN_FALLIDO).length;
                const cumple = !existente.exito && !inexistente.exito &&
                    existente.mensaje === RESPUESTA_GENERICA && inexistente.mensaje === RESPUESTA_GENERICA &&
                    obtenerSesion() === null && fallidos === 2;
                return {
                    cumple,
                    obtenido: "«" + existente.mensaje + "» / «" + inexistente.mensaje + "» · sesión: " +
                        (obtenerSesion() ? "creada" : "ninguna") + " · LOGIN_FALLIDO: " + fallidos
                };
            }
        },
        {
            id: "P5", grupo: "Login", caso: "Bloqueo por intentos fallidos",
            esperado: "Al tercer intento la cuenta se bloquea (CUENTA_BLOQUEADA) y un cuarto intento con la contraseña correcta también se rechaza; además se genera la alerta ALTO de fuerza bruta",
            ejecutar: async () => {
                const correo = CUENTAS_PRUEBA.paciente.correo;
                const r1 = await iniciarSesion(correo, "Incorrecta#1");
                const r2 = await iniciarSesion(correo, "Incorrecta#2");
                const r3 = await iniciarSesion(correo, "Incorrecta#3");
                const r4 = await iniciarSesion(correo, CUENTAS_PRUEBA.paciente.clave);
                const bloqueos = eventosPorAccion(ACCIONES.CUENTA_BLOQUEADA).length;
                const alerta = alertasDeRegla("FUERZA_BRUTA").some((a) => a.nivel === "ALTO");
                const cumple = r1.mensaje === RESPUESTA_GENERICA && r2.mensaje === RESPUESTA_GENERICA &&
                    r3.mensaje === "Cuenta bloqueada temporalmente" && !r4.exito && obtenerSesion() === null &&
                    bloqueos >= 2 && alerta;
                return {
                    cumple, deteccion: alerta,
                    obtenido: "Intento 3: «" + r3.mensaje + "» · intento 4 con clave correcta: " +
                        (r4.exito ? "ENTRÓ" : "rechazado") + " · CUENTA_BLOQUEADA: " + bloqueos + " · alerta fuerza bruta ALTO: " + mensajeSiNo(alerta)
                };
            }
        },
        {
            id: "P6", grupo: "Login", caso: "Intento de XSS",
            esperado: "El payload <script> se rechaza como correo, se detecta como sospechoso y al escaparlo no queda ningún < ni >",
            ejecutar: async () => {
                const payload = "<script>alert(1)</script>";
                const otro = "\"><img src=x onerror=alert(1)>@x.ec";
                const rechazado = validarCorreo(payload) !== null && validarCorreo(otro) !== null;
                const sospechoso = contieneCaracteresSospechosos(payload);
                const escapado = escaparHTML(payload);
                const limpio = !escapado.includes("<") && !escapado.includes(">");
                return {
                    cumple: rechazado && sospechoso && limpio,
                    obtenido: "Rechazado: " + mensajeSiNo(rechazado) + " · sospechoso: " + mensajeSiNo(sospechoso) + " · escapado: " + escapado
                };
            }
        },
        {
            id: "P7", grupo: "Login", caso: "Acceso por rol: panel-logs.html",
            esperado: "Paciente y recepcionista no pueden abrir panel-logs.html: se les redirige a citas.html y se registra ACCESO_DENEGADO",
            ejecutar: async () => {
                const partes = [];
                let cumple = true;
                for (const rol of ["paciente", "recepcionista"]) {
                    await iniciarSesionCompleta(rol);
                    const decision = evaluarAcceso(ROLES_POR_PAGINA["panel-logs.html"], "panel-logs.html");
                    const ok = !decision.permitido && decision.destino === "citas.html";
                    cumple = cumple && ok;
                    partes.push(rol + " → " + (decision.permitido ? "ENTRÓ" : "redirige a " + decision.destino));
                    cerrarSesionSilencioso();
                }
                const denegados = eventosPorAccion(ACCIONES.ACCESO_DENEGADO).length;
                return {
                    cumple: cumple && denegados === 2,
                    obtenido: partes.join(" · ") + " · ACCESO_DENEGADO: " + denegados
                };
            }
        },
        {
            id: "P8", grupo: "Login", caso: "Comportamiento por rol (con MFA)",
            esperado: "Cada rol (administrador y recepcionista tras completar el MFA) abre solo sus páginas: pacientes, odontólogo y recepción → citas.html; administrador → panel-logs, simulador y pruebas",
            ejecutar: async () => {
                const partes = [];
                let cumple = true;
                for (const rol of Object.keys(CUENTAS_PRUEBA)) {
                    const { login, mfa } = await iniciarSesionCompleta(rol);
                    const entro = obtenerSesion() !== null && obtenerSesion().rol === rol;
                    let paginasOk = true;
                    const abiertas = [];
                    Object.keys(ROLES_POR_PAGINA).forEach((pagina) => {
                        const permitido = evaluarAcceso(ROLES_POR_PAGINA[pagina], pagina).permitido;
                        if (permitido) abiertas.push(pagina);
                        if (permitido !== PAGINAS_PERMITIDAS_ESPERADAS[rol].includes(pagina)) paginasOk = false;
                    });
                    const mfaCorrecto = rolRequiereMFA(rol) ? (login.requiereMFA === true && mfa && mfa.estado === "OK") : login.requiereMFA === false;
                    const inicioOk = paginaInicioPorRol(rol) === PAGINAS_PERMITIDAS_ESPERADAS[rol][0];
                    cumple = cumple && entro && paginasOk && mfaCorrecto && inicioOk;
                    partes.push(rol + (rolRequiereMFA(rol) ? " (MFA)" : "") + ": " + abiertas.join(", "));
                    cerrarSesionSilencioso();
                }
                return { cumple, obtenido: partes.join(" | ") };
            }
        },
        {
            id: "P9", grupo: "Login", caso: "Administrador abre citas.html por URL",
            esperado: "Con credenciales correctas del administrador (y MFA) accede solo al registro de eventos; no puede abrir la agenda (citas.html redirige a panel-logs.html)",
            ejecutar: async () => {
                await iniciarSesionCompleta("administrador");
                const sesion = obtenerSesion();
                const agenda = evaluarAcceso(ROLES_POR_PAGINA["citas.html"], "citas.html");
                const registro = evaluarAcceso(ROLES_POR_PAGINA["panel-logs.html"], "panel-logs.html");
                const cumple = sesion !== null && sesion.rol === "administrador" &&
                    !agenda.permitido && agenda.destino === "panel-logs.html" && registro.permitido;
                return {
                    cumple,
                    obtenido: "Sesión: " + (sesion ? sesion.rol : "ninguna") + " · citas.html: " +
                        (agenda.permitido ? "ENTRÓ" : "redirige a " + agenda.destino) + " · panel-logs.html: " +
                        (registro.permitido ? "permitido" : "denegado")
                };
            }
        },

        // ---------------- MFA (P10-P15) ----------------
        {
            id: "P10", grupo: "MFA", caso: "Código correcto → acceso según el rol",
            esperado: "Recepcionista entra a citas.html y administrador a panel-logs.html; MFA_ENVIADO → MFA_EXITOSO → LOGIN_EXITOSO y sin sesión antes del código",
            ejecutar: async () => {
                const partes = [];
                let cumple = true;
                for (const [rol, inicio] of [["recepcionista", "citas.html"], ["administrador", "panel-logs.html"]]) {
                    reiniciarEstadoPruebas();
                    const login = await iniciarSesion(CUENTAS_PRUEBA[rol].correo, CUENTAS_PRUEBA[rol].clave);
                    const sinSesionAntes = obtenerSesion() === null;
                    const resultado = verificarCodigoMFA(obtenerDesafioMFA().codigo);
                    const sesion = obtenerSesion();
                    const acciones = obtenerEventos().map((e) => e.accion);
                    const orden = acciones.indexOf(ACCIONES.MFA_ENVIADO) < acciones.indexOf(ACCIONES.MFA_EXITOSO) &&
                        acciones.indexOf(ACCIONES.MFA_EXITOSO) < acciones.indexOf(ACCIONES.LOGIN_EXITOSO);
                    const ok = login.requiereMFA && sinSesionAntes && resultado.estado === "OK" &&
                        sesion && sesion.rol === rol && paginaInicioPorRol(rol) === inicio && orden;
                    cumple = cumple && Boolean(ok);
                    partes.push(rol + " → " + (sesion ? inicio : "sin acceso"));
                }
                return { cumple, obtenido: partes.join(" · ") };
            }
        },
        {
            id: "P11", grupo: "MFA", caso: "Código incorrecto",
            esperado: "Estado INCORRECTO con 2 intentos restantes, un MFA_FALLIDO en el registro y sin sesión",
            ejecutar: async () => {
                await iniciarSesion(CUENTAS_PRUEBA.recepcionista.correo, CUENTAS_PRUEBA.recepcionista.clave);
                const resultado = verificarCodigoMFA(codigoIncorrecto(obtenerDesafioMFA().codigo));
                const fallidos = eventosPorAccion(ACCIONES.MFA_FALLIDO).length;
                return {
                    cumple: resultado.estado === "INCORRECTO" && resultado.intentosRestantes === 2 &&
                        fallidos === 1 && obtenerSesion() === null && obtenerDesafioMFA() !== null,
                    obtenido: "Estado: " + resultado.estado + " · intentos restantes: " + resultado.intentosRestantes +
                        " · MFA_FALLIDO: " + fallidos + " · sesión: " + (obtenerSesion() ? "creada" : "ninguna")
                };
            }
        },
        {
            id: "P12", grupo: "MFA", caso: "Tres códigos incorrectos",
            esperado: "Estado AGOTADO, login cancelado (sin sesión ni código pendiente) y alerta ALTO por fallos de MFA",
            ejecutar: async () => {
                await iniciarSesion(CUENTAS_PRUEBA.administrador.correo, CUENTAS_PRUEBA.administrador.clave);
                const codigo = obtenerDesafioMFA().codigo;
                const malo = codigoIncorrecto(codigo);
                verificarCodigoMFA(malo);
                verificarCodigoMFA(malo);
                const tercero = verificarCodigoMFA(malo);
                const despues = verificarCodigoMFA(codigo);
                const alerta = alertasDeRegla("FALLOS_MFA").some((a) => a.nivel === "ALTO");
                return {
                    cumple: tercero.estado === "AGOTADO" && obtenerSesion() === null &&
                        obtenerDesafioMFA() === null && despues.estado === "SIN_DESAFIO" && alerta,
                    deteccion: alerta,
                    obtenido: "Tercer intento: " + tercero.estado + " · código correcto posterior: " + despues.estado +
                        " · alerta ALTO fallos MFA: " + mensajeSiNo(alerta)
                };
            }
        },
        {
            id: "P13", grupo: "MFA", caso: "Código expirado",
            esperado: "Un código correcto pero vencido (más de 2 minutos) da EXPIRADO, registra MFA_EXPIRADO una sola vez y no crea sesión",
            ejecutar: async () => {
                await iniciarSesion(CUENTAS_PRUEBA.recepcionista.correo, CUENTAS_PRUEBA.recepcionista.clave);
                const desafio = obtenerDesafioMFA();
                desafio.vence = Date.now() - 1000; // se simula que pasaron mas de 2 minutos
                sessionStorage.setItem(CLAVE_MFA, JSON.stringify(desafio));
                const resultado = verificarCodigoMFA(desafio.codigo);
                const repetido = expirarDesafioSiVencido();
                const expirados = eventosPorAccion(ACCIONES.MFA_EXPIRADO).length;
                return {
                    cumple: resultado.estado === "EXPIRADO" && obtenerSesion() === null && expirados === 1 && repetido === false,
                    obtenido: "Estado: " + resultado.estado + " · MFA_EXPIRADO: " + expirados + " · sesión: " + (obtenerSesion() ? "creada" : "ninguna")
                };
            }
        },
        {
            id: "P14", grupo: "MFA", caso: "Abrir páginas protegidas sin completar el MFA",
            esperado: "Con la contraseña validada pero sin código, citas.html y panel-logs.html redirigen a index.html y no existe sesión",
            ejecutar: async () => {
                const partes = [];
                let cumple = true;
                for (const rol of ["recepcionista", "administrador"]) {
                    reiniciarEstadoPruebas();
                    await iniciarSesion(CUENTAS_PRUEBA[rol].correo, CUENTAS_PRUEBA[rol].clave);
                    for (const pagina of ["citas.html", "panel-logs.html"]) {
                        const decision = evaluarAcceso(ROLES_POR_PAGINA[pagina], pagina);
                        cumple = cumple && !decision.permitido && decision.destino === "index.html";
                        partes.push(rol + " " + pagina + " → " + (decision.permitido ? "ENTRÓ" : decision.destino));
                    }
                    cumple = cumple && obtenerSesion() === null;
                }
                return { cumple, obtenido: partes.join(" · ") };
            }
        },
        {
            id: "P15", grupo: "MFA", caso: "Paciente y odontólogo sin MFA",
            esperado: "Ambos inician sesión solo con la contraseña, sin código pendiente ni eventos MFA",
            ejecutar: async () => {
                const partes = [];
                let cumple = true;
                for (const rol of ["paciente", "odontologo"]) {
                    reiniciarEstadoPruebas();
                    const login = await iniciarSesion(CUENTAS_PRUEBA[rol].correo, CUENTAS_PRUEBA[rol].clave);
                    const sesion = obtenerSesion();
                    const sinMFA = obtenerDesafioMFA() === null &&
                        !obtenerEventos().some((e) => e.accion.indexOf("MFA_") === 0);
                    cumple = cumple && login.exito && login.requiereMFA === false && sesion && sesion.rol === rol && sinMFA;
                    partes.push(rol + ": " + (sesion ? "sesión directa" : "sin sesión") + (sinMFA ? ", sin MFA" : ", CON MFA"));
                }
                return { cumple, obtenido: partes.join(" · ") };
            }
        },

        // ---------------- Escenarios del simulador (E1-E4) ----------------
        escenarioSimulador("E1", "Escenario 1: fuerza bruta", simularFuerzaBruta, "FUERZA_BRUTA", "ALTO"),
        escenarioSimulador("E2", "Escenario 2: acceso fuera de horario (23:40)", simularAccesoFueraDeHorario, "ACCESO_FUERA_HORARIO", "MEDIO"),
        escenarioSimulador("E3", "Escenario 3: escalamiento de privilegios", simularEscalamientoPrivilegios, "ESCALAMIENTO_PRIVILEGIOS", "ALTO"),
        escenarioSimulador("E4", "Escenario 4: enumeración de cuentas", simularEnumeracionCuentas, "ENUMERACION_CUENTAS", "ALTO"),

        // ---------------- Casos benignos (falsos positivos) ----------------
        casoBenigno("F1", "Dos intentos fallidos del mismo correo en 1 minuto", () => {
            registrarEvento("a@sonrisa.ec", "desconocido", ACCIONES.LOGIN_FALLIDO, "FALLO", "Intento 1 de 3", { fecha_hora: hoyA(10, 0, 0) });
            registrarEvento("a@sonrisa.ec", "desconocido", ACCIONES.LOGIN_FALLIDO, "FALLO", "Intento 2 de 3", { fecha_hora: hoyA(10, 0, 40) });
        }),
        casoBenigno("F2", "Tres fallos del mismo correo espaciados más de 5 minutos", () => {
            const base = new Date(hoyA(10, 0, 0)).getTime();
            [0, 200, 400].forEach((seg) => registrarEvento("b@sonrisa.ec", "desconocido", ACCIONES.LOGIN_FALLIDO,
                "FALLO", "Intento", { fecha_hora: new Date(base + seg * 1000).toISOString() }));
        }),
        casoBenigno("F3", "Fallos con solo dos correos distintos", () => {
            registrarEvento("c@sonrisa.ec", "desconocido", ACCIONES.LOGIN_FALLIDO, "FALLO", "Intento 1 de 3", { fecha_hora: hoyA(10, 5, 0) });
            registrarEvento("d@sonrisa.ec", "desconocido", ACCIONES.LOGIN_FALLIDO, "FALLO", "Intento 1 de 3", { fecha_hora: hoyA(10, 5, 20) });
        }),
        casoBenigno("F4", "Inicios de sesión en el límite del horario (08:00 y 17:59)", () => {
            registrarEvento("e@sonrisa.ec", "paciente", ACCIONES.LOGIN_EXITOSO, "EXITO", "Inicio de sesión correcto", { fecha_hora: hoyA(8, 0, 0) });
            registrarEvento("e@sonrisa.ec", "paciente", ACCIONES.LOGIN_EXITOSO, "EXITO", "Inicio de sesión correcto", { fecha_hora: hoyA(17, 59, 0) });
        }),
        casoBenigno("F5", "Un acceso denegado y dos en sesiones distintas", () => {
            registrarEvento("f@sonrisa.ec", "paciente", ACCIONES.ACCESO_DENEGADO, "FALLO", "Acceso no autorizado", { fecha_hora: hoyA(11, 0, 0), sesion_id: "SES-A" });
            registrarEvento("g@sonrisa.ec", "paciente", ACCIONES.ACCESO_DENEGADO, "FALLO", "Acceso no autorizado", { fecha_hora: hoyA(11, 1, 0), sesion_id: "SES-B" });
            registrarEvento("g@sonrisa.ec", "paciente", ACCIONES.ACCESO_DENEGADO, "FALLO", "Acceso no autorizado", { fecha_hora: hoyA(11, 2, 0), sesion_id: "SES-C" });
        }),
        casoBenigno("F6", "Dos códigos MFA fallidos seguidos de uno correcto", () => {
            registrarEvento("h@sonrisa.ec", "recepcionista", ACCIONES.MFA_FALLIDO, "FALLO", "Código MFA incorrecto", { fecha_hora: hoyA(9, 0, 0) });
            registrarEvento("h@sonrisa.ec", "recepcionista", ACCIONES.MFA_FALLIDO, "FALLO", "Código MFA incorrecto", { fecha_hora: hoyA(9, 0, 20) });
            registrarEvento("h@sonrisa.ec", "recepcionista", ACCIONES.MFA_EXITOSO, "EXITO", "Código MFA verificado", { fecha_hora: hoyA(9, 0, 45) });
        }),
        casoBenigno("F7", "Jornada normal de un paciente (login, cita y logout en horario)", () => {
            registrarEvento("i@sonrisa.ec", "paciente", ACCIONES.LOGIN_EXITOSO, "EXITO", "Inicio de sesión correcto", { fecha_hora: hoyA(10, 0, 0), sesion_id: "SES-N" });
            registrarEvento("i@sonrisa.ec", "paciente", ACCIONES.CITA_CREADA, "EXITO", "Cita creada", { fecha_hora: hoyA(10, 2, 0), sesion_id: "SES-N" });
            registrarEvento("i@sonrisa.ec", "paciente", ACCIONES.LOGOUT, "EXITO", "Cierre de sesión", { fecha_hora: hoyA(10, 5, 0), sesion_id: "SES-N" });
        })
    ];
}

/**
 * Crea el caso de un escenario del simulador: debe generar exactamente una
 * alerta de la regla y nivel esperados, con todos sus eventos marcados como
 * simulados.
 */
function escenarioSimulador(id, caso, escenario, regla, nivel) {
    return {
        id, grupo: "Simulador", caso,
        esperado: "Una alerta " + nivel + " de la regla «" + REGLAS_DETECCION[regla] + "» con eventos marcados como SIMULADO",
        ejecutar: async () => {
            const corrida = escenario();
            const resumen = resumirCorrida(corrida);
            const eventos = obtenerEventos();
            const simulados = eventos.every((e) => e.simulado === true && e.detalle.indexOf("SIMULADO") === 0);
            const alerta = resumen.alertas.length === 1 && resumen.alertas[0].regla === regla && resumen.alertas[0].nivel === nivel;
            return {
                cumple: alerta && simulados, deteccion: alerta,
                obtenido: resumen.alertas.length + " alerta(s): " +
                    (resumen.alertas.map((a) => REGLAS_DETECCION[a.regla] + " " + a.nivel).join(", ") || "ninguna") +
                    " · " + resumen.totalEventos + " eventos · todos simulados: " + mensajeSiNo(simulados)
            };
        }
    };
}

/**
 * Crea un caso de actividad legitima: no debe generar ninguna alerta. Cada
 * alerta que aparezca cuenta como un falso positivo.
 */
function casoBenigno(id, caso, generarActividad) {
    return {
        id, grupo: "Falsos positivos", caso,
        esperado: "Actividad legítima: 0 alertas",
        ejecutar: async () => {
            generarActividad();
            const alertas = totalAlertas();
            return {
                cumple: alertas === 0, alertas,
                obtenido: alertas + " alerta(s)" + (alertas ? ": " + obtenerAlertasActivas().map((a) => REGLAS_DETECCION[a.regla]).join(", ") : "")
            };
        }
    };
}

/**
 * Ejecuta un caso con el estado aislado y mide su duracion. Una excepcion se
 * informa como NO CUMPLE en vez de detener toda la suite.
 */
async function ejecutarCaso(caso) {
    reiniciarEstadoPruebas();
    const inicio = performance.now();
    let resultado;
    try {
        resultado = await caso.ejecutar();
    } catch (error) {
        resultado = { cumple: false, obtenido: "Error durante la prueba: " + (error && error.message ? error.message : error) };
    }
    return {
        id: caso.id,
        grupo: caso.grupo,
        caso: caso.caso,
        esperado: caso.esperado,
        obtenido: resultado.obtenido,
        cumple: Boolean(resultado.cumple),
        deteccion: resultado.deteccion,
        alertas: resultado.alertas,
        duracionMs: Math.round((performance.now() - inicio) * 10) / 10
    };
}

// ----------------------------------------------------------------
// Metricas de calidad
// ----------------------------------------------------------------

function promedio(valores) {
    return valores.reduce((suma, v) => suma + v, 0) / valores.length;
}

function redondear(valor, decimales) {
    const f = Math.pow(10, decimales);
    return Math.round(valor * f) / f;
}

/** Ejecuta fn() n veces y devuelve los tiempos de cada una, en ms. */
async function medirRepeticiones(n, fn) {
    const tiempos = [];
    for (let i = 0; i < n; i++) {
        const inicio = performance.now();
        await fn(i);
        tiempos.push(performance.now() - inicio);
    }
    return tiempos;
}

/**
 * Calcula las metricas de calidad a partir de los resultados de los casos
 * y de mediciones de tiempo repetidas.
 *
 * @param {object[]} resultados
 * @returns {Promise<object>}
 */
async function calcularMetricas(resultados) {
    const superados = resultados.filter((r) => r.cumple).length;

    const deteccion = resultados.filter((r) => r.deteccion !== undefined);
    const detectados = deteccion.filter((r) => r.deteccion).length;

    const benignos = resultados.filter((r) => r.grupo === "Falsos positivos");
    const alertasBenignas = benignos.reduce((suma, r) => suma + (r.alertas || 0), 0);
    const casosConFalsoPositivo = benignos.filter((r) => (r.alertas || 0) > 0).length;

    // Tiempo de login: contrasena correcta de los 4 roles, ida y vuelta completa
    // (lee usuarios.json, deriva PBKDF2 y, si corresponde, genera el desafio MFA).
    const roles = Object.keys(CUENTAS_PRUEBA);
    reiniciarEstadoPruebas();
    const tiemposLogin = await medirRepeticiones(REPETICIONES_LOGIN, async (i) => {
        const cuenta = CUENTAS_PRUEBA[roles[i % roles.length]];
        await iniciarSesion(cuenta.correo, cuenta.clave);
        reiniciarEstadoPruebas();
    });

    // Hash: SHA-256 simple frente a PBKDF2 (150 000 iteraciones).
    const tiemposSHA = await medirRepeticiones(REPETICIONES_SHA256, () => calcularHashSHA256("Paciente#2024"));
    const tiemposPBKDF2 = await medirRepeticiones(REPETICIONES_PBKDF2,
        () => derivarHashPBKDF2("Paciente#2024", SAL_SENUELO, ITERACIONES_PBKDF2));

    // Verificacion del MFA: solo se cronometra verificarCodigoMFA (incluye crear la sesion y los eventos).
    const usuarioMFA = { correo: CUENTAS_PRUEBA.recepcionista.correo, nombre: "Prueba", rol: "recepcionista" };
    const tiemposMFA = [];
    for (let i = 0; i < REPETICIONES_MFA; i++) {
        reiniciarEstadoPruebas();
        const codigo = iniciarDesafioMFA(usuarioMFA).codigo;
        const inicio = performance.now();
        verificarCodigoMFA(codigo);
        tiemposMFA.push(performance.now() - inicio);
    }
    reiniciarEstadoPruebas();

    const msSHA = promedio(tiemposSHA);
    const msPBKDF2 = promedio(tiemposPBKDF2);

    return {
        casosTotales: resultados.length,
        casosSuperados: superados,
        porcentajeSuperados: redondear(superados / resultados.length * 100, 1),
        deteccion: {
            esperadas: deteccion.length,
            detectadas: detectados,
            tasaPorcentaje: deteccion.length ? redondear(detectados / deteccion.length * 100, 1) : null,
            casos: deteccion.map((r) => r.id)
        },
        falsosPositivos: {
            casosBenignos: benignos.length,
            alertasGeneradas: alertasBenignas,
            casosConFalsoPositivo,
            tasaPorcentaje: benignos.length ? redondear(casosConFalsoPositivo / benignos.length * 100, 1) : null
        },
        tiempoLogin: {
            promedioMs: redondear(promedio(tiemposLogin), 1),
            minimoMs: redondear(Math.min(...tiemposLogin), 1),
            maximoMs: redondear(Math.max(...tiemposLogin), 1),
            repeticiones: REPETICIONES_LOGIN
        },
        tiempoHash: {
            sha256Ms: redondear(msSHA, 4),
            pbkdf2Ms: redondear(msPBKDF2, 2),
            iteracionesPBKDF2: ITERACIONES_PBKDF2,
            vecesMasLento: redondear(msPBKDF2 / msSHA, 0),
            repeticionesSHA256: REPETICIONES_SHA256,
            repeticionesPBKDF2: REPETICIONES_PBKDF2
        },
        tiempoVerificacionMFA: {
            promedioMs: redondear(promedio(tiemposMFA), 3),
            maximoMs: redondear(Math.max(...tiemposMFA), 3),
            repeticiones: REPETICIONES_MFA
        }
    };
}

// ----------------------------------------------------------------
// Suite completa
// ----------------------------------------------------------------

/**
 * Ejecuta todos los casos y calcula las metricas. El estado real (registro,
 * bloqueos, sesion y MFA) se respalda antes y se restaura siempre al final,
 * incluso si algo falla.
 *
 * @param {function(number, number, object)} [alProgresar] Se llama tras cada caso
 * @returns {Promise<{entorno: object, resultados: object[], metricas: object, duracionTotalMs: number}>}
 */
async function ejecutarSuitePruebas(alProgresar) {
    const entorno = obtenerEntornoEjecucion();
    const inicio = performance.now();
    const respaldo = tomarRespaldoPruebas();

    try {
        const casos = definirCasos();
        const resultados = [];
        for (let i = 0; i < casos.length; i++) {
            const resultado = await ejecutarCaso(casos[i]);
            resultados.push(resultado);
            if (alProgresar) alProgresar(i + 1, casos.length, resultado);
        }
        const metricas = await calcularMetricas(resultados);
        return {
            entorno,
            resultados,
            metricas,
            duracionTotalMs: Math.round(performance.now() - inicio)
        };
    } finally {
        restaurarRespaldoPruebas(respaldo);
    }
}

// ----------------------------------------------------------------
// Exportacion
// ----------------------------------------------------------------

/**
 * Convierte la suite a texto JSON.
 *
 * @param {object} suite Resultado de ejecutarSuitePruebas
 * @returns {string}
 */
function resultadosAJSON(suite) {
    return JSON.stringify(suite, null, 2);
}

/**
 * Prepara una celda CSV: la entrecomilla y neutraliza las formulas
 * (los textos que empiezan por = + - @ llevan un apostrofe delante).
 */
function celdaCSV(valor) {
    let texto = valor === null || valor === undefined ? "" : String(valor);
    if (/^[=+\-@]/.test(texto)) texto = "'" + texto;
    return '"' + texto.replace(/"/g, '""') + '"';
}

/**
 * Convierte la suite a CSV (UTF-8 con BOM para Excel): entorno, tabla de
 * resultados y metricas, separados por una linea en blanco.
 *
 * @param {object} suite Resultado de ejecutarSuitePruebas
 * @returns {string}
 */
function resultadosACSV(suite) {
    const fila = (...celdas) => celdas.map(celdaCSV).join(",");
    const m = suite.metricas;
    const e = suite.entorno;
    const lineas = [];

    lineas.push(fila("Pruebas automatizadas DentaCita"));
    lineas.push(fila("Fecha", e.fecha));
    lineas.push(fila("Hora", e.hora));
    lineas.push(fila("Zona horaria", e.zonaHoraria));
    lineas.push(fila("Navegador", e.navegador));
    lineas.push(fila("User agent", e.userAgent));
    lineas.push(fila("Plataforma", e.plataforma));
    lineas.push(fila("URL", e.url));
    lineas.push("");
    lineas.push(fila("ID", "Grupo", "Caso", "Resultado esperado", "Resultado obtenido", "Veredicto", "Duración (ms)"));
    suite.resultados.forEach((r) => {
        lineas.push(fila(r.id, r.grupo, r.caso, r.esperado, r.obtenido, r.cumple ? "CUMPLE" : "NO CUMPLE", r.duracionMs));
    });
    lineas.push("");
    lineas.push(fila("Métrica", "Valor", "Detalle"));
    lineas.push(fila("Casos superados (%)", m.porcentajeSuperados, m.casosSuperados + " de " + m.casosTotales));
    lineas.push(fila("Tasa de detección de reglas (%)", m.deteccion.tasaPorcentaje, m.deteccion.detectadas + " de " + m.deteccion.esperadas + " (" + m.deteccion.casos.join(", ") + ")"));
    lineas.push(fila("Falsos positivos (casos benignos con alerta)", m.falsosPositivos.casosConFalsoPositivo, m.falsosPositivos.alertasGeneradas + " alertas en " + m.falsosPositivos.casosBenignos + " casos benignos (" + m.falsosPositivos.tasaPorcentaje + " %)"));
    lineas.push(fila("Tiempo promedio de login (ms)", m.tiempoLogin.promedioMs, "mín " + m.tiempoLogin.minimoMs + " · máx " + m.tiempoLogin.maximoMs + " · " + m.tiempoLogin.repeticiones + " repeticiones"));
    lineas.push(fila("Hash SHA-256 (ms)", m.tiempoHash.sha256Ms, m.tiempoHash.repeticionesSHA256 + " repeticiones"));
    lineas.push(fila("Hash PBKDF2-SHA256 (ms)", m.tiempoHash.pbkdf2Ms, m.tiempoHash.iteracionesPBKDF2 + " iteraciones · " + m.tiempoHash.vecesMasLento + " veces más lento que SHA-256"));
    lineas.push(fila("Verificación MFA (ms)", m.tiempoVerificacionMFA.promedioMs, "máx " + m.tiempoVerificacionMFA.maximoMs + " · " + m.tiempoVerificacionMFA.repeticiones + " repeticiones"));
    lineas.push(fila("Duración total de la ejecución (ms)", suite.duracionTotalMs, ""));

    return "﻿" + lineas.join("\r\n") + "\r\n";
}
