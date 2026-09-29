/**
 * logs.js
 * -----------------------------------------------------------
 * Registro de eventos de seguridad y deteccion de alertas de DentaCita.
 *
 * Los eventos se guardan en localStorage bajo la clave
 * "dentacita_logs" como un arreglo de objetos. Cada evento tiene:
 *   { id, fecha_hora, usuario, rol, accion, resultado, detalle, sesion_id }
 * y, segun el caso, campos opcionales:
 *   - nivel, regla, clave, evento_origen  (eventos ALERTA_SEGURIDAD)
 *   - alerta_id                           (eventos ALERTA_REVISADA)
 *   - simulado, corrida                   (eventos del simulador de incidentes)
 *
 * INTEGRIDAD: el registro es "solo agregar". Este archivo no ofrece
 * ninguna funcion para editar o borrar eventos, con una unica excepcion
 * controlada: borrarEventosSimulados(), que solo elimina los eventos
 * marcados como simulados y deja constancia de ello en el propio log.
 *
 * IMPORTANTE: nunca se registra la contrasena del usuario, ni en
 * texto plano ni en hash.
 * -----------------------------------------------------------
 */

const CLAVE_LOGS = "dentacita_logs";

// Clave de la sesion activa (la misma que define auth.js). Se repite aqui
// con otro nombre porque logs.js se carga antes que auth.js.
const CLAVE_SESION_PARA_LOGS = "dentacita_sesion";

// Catalogo de acciones reconocidas por el sistema.
const ACCIONES = {
    LOGIN_EXITOSO: "LOGIN_EXITOSO",
    LOGIN_FALLIDO: "LOGIN_FALLIDO",
    CUENTA_BLOQUEADA: "CUENTA_BLOQUEADA",
    ACCESO_FUERA_HORARIO: "ACCESO_FUERA_HORARIO",
    ACCESO_DENEGADO: "ACCESO_DENEGADO",
    LOGOUT: "LOGOUT",
    CITA_CREADA: "CITA_CREADA",
    CITA_CANCELADA: "CITA_CANCELADA",
    ALERTA_SEGURIDAD: "ALERTA_SEGURIDAD",
    ALERTA_REVISADA: "ALERTA_REVISADA",
    LOG_EXPORTADO: "LOG_EXPORTADO",
    LOG_SIMULADOS_BORRADOS: "LOG_SIMULADOS_BORRADOS"
};

// Roles que pueden aparecer en el registro (para los filtros del panel).
const ROLES_REGISTRO = [
    "paciente", "recepcionista", "odontologo", "administrador",
    "desconocido", "sistema"
];

// ----------------------------------------------------------------
// Reglas de deteccion: constantes
// ----------------------------------------------------------------

const NIVELES_ALERTA = { ALTO: "ALTO", MEDIO: "MEDIO" };

const REGLAS_DETECCION = {
    FUERZA_BRUTA: "Fuerza bruta",
    ENUMERACION_CUENTAS: "Enumeración de cuentas",
    ESCALAMIENTO_PRIVILEGIOS: "Escalamiento de privilegios",
    ACCESO_FUERA_HORARIO: "Acceso fuera de horario"
};

const VENTANA_DETECCION_MS = 5 * 60 * 1000; // 5 minutos
const UMBRAL_FUERZA_BRUTA = 3;              // intentos fallidos del mismo correo
const UMBRAL_ENUMERACION = 3;               // correos distintos con intentos fallidos
const UMBRAL_ESCALAMIENTO = 2;              // accesos denegados en la misma sesion
const LOGS_HORA_APERTURA = 8;               // 08:00
const LOGS_HORA_CIERRE = 18;                // 18:00

// ----------------------------------------------------------------
// Utilidades
// ----------------------------------------------------------------

/**
 * Genera un identificador unico con un prefijo, por ejemplo
 * "EVT-lq3k9x2a-1f9c0a7d3b21". Combina la marca de tiempo con bytes
 * aleatorios criptograficos.
 */
function generarId(prefijo) {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    const aleatorio = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return prefijo + "-" + Date.now().toString(36) + "-" + aleatorio;
}

/**
 * Devuelve el id de la sesion activa (lo asigna auth.js al iniciar
 * sesion) o null si no hay sesion. Sirve para agrupar eventos por sesion.
 */
function obtenerIdSesionActual() {
    try {
        const datos = sessionStorage.getItem(CLAVE_SESION_PARA_LOGS);
        const sesion = datos ? JSON.parse(datos) : null;
        return sesion && sesion.id ? sesion.id : null;
    } catch (error) {
        return null;
    }
}

function guardarEventos(eventos) {
    try {
        localStorage.setItem(CLAVE_LOGS, JSON.stringify(eventos));
    } catch (error) {
        // Si localStorage falla (por ejemplo, esta lleno), no
        // interrumpimos el flujo de la aplicacion por un error de log.
        console.error("No se pudo guardar el registro de eventos:", error);
    }
}

function marcaDeTiempo(evento) {
    return new Date(evento.fecha_hora).getTime();
}

// ----------------------------------------------------------------
// Lectura y escritura del registro
// ----------------------------------------------------------------

/**
 * Registra un evento en el localStorage y luego aplica las reglas de
 * deteccion, que pueden generar alertas automaticas.
 *
 * @param {string} usuario   Correo del usuario (o "desconocido" si no aplica)
 * @param {string} rol       Rol del usuario
 * @param {string} accion    Una de las constantes de ACCIONES
 * @param {string} resultado "EXITO" | "FALLO" | "ALERTA"
 * @param {string} detalle   Descripcion breve, sin datos sensibles
 * @param {object} [extras]  Campos opcionales: fecha_hora (ISO), sesion_id,
 *                           simulado, corrida, nivel, regla, clave,
 *                           evento_origen, alerta_id
 * @returns {object} el evento registrado
 */
function registrarEvento(usuario, rol, accion, resultado, detalle, extras) {
    const opciones = extras || {};

    const evento = {
        id: generarId("EVT"),
        fecha_hora: opciones.fecha_hora || new Date().toISOString(),
        usuario: usuario || "desconocido",
        rol: rol || "desconocido",
        accion: accion,
        resultado: resultado,
        detalle: detalle || "",
        sesion_id: opciones.sesion_id !== undefined
            ? opciones.sesion_id
            : obtenerIdSesionActual()
    };

    // Solo se copian los campos opcionales conocidos (el id nunca se puede pisar).
    ["simulado", "corrida", "nivel", "regla", "clave", "evento_origen", "alerta_id"]
        .forEach((campo) => {
            if (opciones[campo] !== undefined) {
                evento[campo] = opciones[campo];
            }
        });

    const eventos = obtenerEventos();
    eventos.push(evento);
    guardarEventos(eventos);

    evaluarReglasDeteccion(evento);

    return evento;
}

/**
 * Devuelve todos los eventos guardados en el orden en que se
 * registraron. Si algun evento antiguo no tiene id, se le asigna uno
 * (migracion unica) para que todos los eventos sean identificables.
 */
function obtenerEventos() {
    try {
        const datos = localStorage.getItem(CLAVE_LOGS);
        const eventos = datos ? JSON.parse(datos) : [];
        if (!Array.isArray(eventos)) return [];

        let huboMigracion = false;
        eventos.forEach((evento, indice) => {
            if (!evento.id) {
                evento.id = "EVT-ANT-" + indice;
                huboMigracion = true;
            }
        });
        if (huboMigracion) {
            guardarEventos(eventos);
        }
        return eventos;
    } catch (error) {
        console.error("No se pudo leer el registro de eventos:", error);
        return [];
    }
}

/**
 * Devuelve una copia de los eventos ordenada del mas reciente al mas
 * antiguo (por fecha; si empatan, el ultimo registrado va primero).
 */
function ordenarRecientesPrimero(eventos) {
    return eventos
        .map((evento, indice) => ({ evento, indice }))
        .sort((a, b) => {
            const diferencia = marcaDeTiempo(b.evento) - marcaDeTiempo(a.evento);
            return diferencia !== 0 ? diferencia : b.indice - a.indice;
        })
        .map((par) => par.evento);
}

/**
 * Devuelve el texto JSON del registro completo, listo para descargar.
 */
function exportarEventosComoJSON() {
    return JSON.stringify(obtenerEventos(), null, 2);
}

// ----------------------------------------------------------------
// Filtros y resumen (panel del administrador)
// ----------------------------------------------------------------

/**
 * Filtra eventos segun los criterios dados. Todos son opcionales:
 * { usuario, rol, accion, resultado, desde, hasta }
 * "usuario" busca coincidencia parcial sin distinguir mayusculas;
 * "desde"/"hasta" son fechas "AAAA-MM-DD" (ambas incluidas).
 */
function filtrarEventos(eventos, filtros) {
    const usuario = (filtros.usuario || "").trim().toLowerCase();
    const desde = filtros.desde ? new Date(filtros.desde + "T00:00:00").getTime() : null;
    const hasta = filtros.hasta ? new Date(filtros.hasta + "T23:59:59.999").getTime() : null;

    return eventos.filter((evento) => {
        if (usuario && !evento.usuario.toLowerCase().includes(usuario)) return false;
        if (filtros.rol && evento.rol !== filtros.rol) return false;
        if (filtros.accion && evento.accion !== filtros.accion) return false;
        if (filtros.resultado && evento.resultado !== filtros.resultado) return false;

        const momento = marcaDeTiempo(evento);
        if (desde !== null && momento < desde) return false;
        if (hasta !== null && momento > hasta) return false;
        return true;
    });
}

/**
 * Calcula los totales de las tarjetas resumen del panel.
 */
function calcularResumen(eventos) {
    const contar = (accion) => eventos.filter((e) => e.accion === accion).length;
    return {
        total: eventos.length,
        loginsExitosos: contar(ACCIONES.LOGIN_EXITOSO),
        loginsFallidos: contar(ACCIONES.LOGIN_FALLIDO),
        bloqueos: contar(ACCIONES.CUENTA_BLOQUEADA),
        alertasActivas: obtenerAlertasActivas().length
    };
}

// ----------------------------------------------------------------
// Reglas de deteccion de amenazas
// ----------------------------------------------------------------

/**
 * Un intento fallido de acceso es un LOGIN_FALLIDO o un CUENTA_BLOQUEADA
 * con resultado FALLO. Se cuentan ambos porque el intento que provoca el
 * bloqueo (el tercero) se registra como CUENTA_BLOQUEADA y no como
 * LOGIN_FALLIDO.
 */
function esIntentoFallido(evento) {
    return evento.resultado === "FALLO" &&
        (evento.accion === ACCIONES.LOGIN_FALLIDO ||
         evento.accion === ACCIONES.CUENTA_BLOQUEADA);
}

/**
 * Dos eventos son "del mismo origen" si ambos son reales o ambos son de
 * la misma corrida del simulador. Asi, una simulacion nunca se mezcla con
 * actividad real ni con otra simulacion al evaluar las reglas.
 */
function esMismoOrigen(a, b) {
    return Boolean(a.simulado) === Boolean(b.simulado) &&
        (a.corrida || null) === (b.corrida || null);
}

/**
 * Aplica las reglas de deteccion al evento recien registrado y genera
 * las alertas (eventos ALERTA_SEGURIDAD) que correspondan. Las ventanas
 * de tiempo se calculan con la fecha del evento, no con la hora actual.
 *
 * @returns {object[]} alertas generadas
 */
function evaluarReglasDeteccion(nuevo) {
    // Las alertas y sus revisiones no disparan nuevas reglas.
    if (nuevo.accion === ACCIONES.ALERTA_SEGURIDAD ||
        nuevo.accion === ACCIONES.ALERTA_REVISADA) {
        return [];
    }

    const alertas = [];
    const momentoNuevo = marcaDeTiempo(nuevo);
    const todos = obtenerEventos();
    const delMismoOrigen = todos.filter((e) => esMismoOrigen(e, nuevo));

    // Eventos de los ultimos 5 minutos (hasta el evento nuevo, incluido).
    const enVentana = delMismoOrigen.filter((e) => {
        const antiguedad = momentoNuevo - marcaDeTiempo(e);
        return antiguedad >= 0 && antiguedad < VENTANA_DETECCION_MS;
    });

    if (esIntentoFallido(nuevo)) {
        const fallidos = enVentana.filter(esIntentoFallido);

        // Regla 1: fuerza bruta (3+ intentos fallidos del mismo correo).
        const delMismoCorreo = fallidos.filter((e) => e.usuario === nuevo.usuario);
        if (delMismoCorreo.length >= UMBRAL_FUERZA_BRUTA) {
            alertas.push(generarAlerta(nuevo, {
                regla: "FUERZA_BRUTA",
                nivel: NIVELES_ALERTA.ALTO,
                clave: nuevo.usuario,
                detalle: delMismoCorreo.length + " intentos fallidos contra " +
                    nuevo.usuario + " en menos de 5 minutos",
                usuario: nuevo.usuario,
                ventana: true
            }, todos));
        }

        // Regla 2: enumeracion de cuentas (3+ correos distintos con fallos).
        const correosDistintos = Array.from(new Set(fallidos.map((e) => e.usuario)));
        if (correosDistintos.length >= UMBRAL_ENUMERACION) {
            alertas.push(generarAlerta(nuevo, {
                regla: "ENUMERACION_CUENTAS",
                nivel: NIVELES_ALERTA.ALTO,
                clave: "global",
                detalle: correosDistintos.length + " correos distintos con intentos fallidos en menos de 5 minutos (" +
                    correosDistintos.join(", ") + ")",
                usuario: "sistema",
                rol: "sistema",
                ventana: true
            }, todos));
        }
    }

    // Regla 3: escalamiento de privilegios (2+ accesos denegados en la misma sesion).
    if (nuevo.accion === ACCIONES.ACCESO_DENEGADO) {
        const denegados = delMismoOrigen.filter((e) =>
            e.accion === ACCIONES.ACCESO_DENEGADO &&
            e.usuario === nuevo.usuario &&
            (e.sesion_id || null) === (nuevo.sesion_id || null));
        if (denegados.length >= UMBRAL_ESCALAMIENTO) {
            alertas.push(generarAlerta(nuevo, {
                regla: "ESCALAMIENTO_PRIVILEGIOS",
                nivel: NIVELES_ALERTA.ALTO,
                clave: nuevo.usuario + "|" + (nuevo.sesion_id || "sin-sesion"),
                detalle: denegados.length + " accesos denegados de " + nuevo.usuario +
                    " en la misma sesión",
                usuario: nuevo.usuario,
                rol: nuevo.rol,
                ventana: false // una sola alerta por sesion
            }, todos));
        }
    }

    // Regla 4: acceso fuera de horario (antes de 08:00 o desde las 18:00).
    if (nuevo.accion === ACCIONES.LOGIN_EXITOSO) {
        const hora = new Date(nuevo.fecha_hora).getHours();
        if (hora < LOGS_HORA_APERTURA || hora >= LOGS_HORA_CIERRE) {
            alertas.push(generarAlerta(nuevo, {
                regla: "ACCESO_FUERA_HORARIO",
                nivel: NIVELES_ALERTA.MEDIO,
                clave: nuevo.id, // cada ingreso fuera de horario genera su alerta
                detalle: "Inicio de sesión de " + nuevo.usuario + " a las " +
                    new Date(nuevo.fecha_hora).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" }) +
                    ", fuera del horario de atención (08:00-18:00)",
                usuario: nuevo.usuario,
                rol: nuevo.rol,
                ventana: false
            }, todos));
        }
    }

    return alertas.filter(Boolean);
}

/**
 * Crea y guarda un evento ALERTA_SEGURIDAD para el evento que la
 * disparo. Evita duplicados: si ya existe una alerta de la misma regla y
 * la misma clave (dentro de la ventana de 5 min cuando "ventana" es true),
 * no genera otra y devuelve null.
 */
function generarAlerta(disparador, datos, todos) {
    const yaExiste = todos.some((e) =>
        e.accion === ACCIONES.ALERTA_SEGURIDAD &&
        e.regla === datos.regla &&
        e.clave === datos.clave &&
        esMismoOrigen(e, disparador) &&
        (!datos.ventana ||
            marcaDeTiempo(disparador) - marcaDeTiempo(e) < VENTANA_DETECCION_MS));
    if (yaExiste) return null;

    const prefijo = disparador.simulado ? "SIMULADO – " : "";
    const alerta = {
        id: generarId("EVT"),
        fecha_hora: disparador.fecha_hora,
        usuario: datos.usuario,
        rol: datos.rol || "desconocido",
        accion: ACCIONES.ALERTA_SEGURIDAD,
        resultado: "ALERTA",
        detalle: prefijo + REGLAS_DETECCION[datos.regla] + ": " + datos.detalle,
        sesion_id: disparador.sesion_id || null,
        nivel: datos.nivel,
        regla: datos.regla,
        clave: datos.clave,
        evento_origen: disparador.id
    };
    if (disparador.simulado) {
        alerta.simulado = true;
        alerta.corrida = disparador.corrida;
    }

    const eventos = obtenerEventos();
    eventos.push(alerta);
    guardarEventos(eventos);
    return alerta;
}

// ----------------------------------------------------------------
// Alertas: consulta y revision
// ----------------------------------------------------------------

/**
 * Devuelve las alertas que todavia no fueron marcadas como revisadas,
 * de la mas reciente a la mas antigua.
 */
function obtenerAlertasActivas() {
    const eventos = obtenerEventos();
    const revisadas = new Set(
        eventos
            .filter((e) => e.accion === ACCIONES.ALERTA_REVISADA)
            .map((e) => e.alerta_id)
    );
    const activas = eventos.filter(
        (e) => e.accion === ACCIONES.ALERTA_SEGURIDAD && !revisadas.has(e.id)
    );
    return ordenarRecientesPrimero(activas);
}

/**
 * Marca una alerta como revisada registrando un evento ALERTA_REVISADA
 * (la alerta original nunca se modifica ni se borra).
 *
 * @returns {boolean} true si se registro la revision
 */
function marcarAlertaRevisada(idAlerta, sesion) {
    const alerta = obtenerAlertasActivas().find((a) => a.id === idAlerta);
    if (!alerta || !sesion) return false;

    const extras = { alerta_id: alerta.id };
    if (alerta.simulado) {
        extras.simulado = true;
        extras.corrida = alerta.corrida;
    }
    registrarEvento(sesion.correo, sesion.rol, ACCIONES.ALERTA_REVISADA, "EXITO",
        (alerta.simulado ? "SIMULADO – " : "") +
        "Alerta revisada: " + REGLAS_DETECCION[alerta.regla] +
        " (" + alerta.id + ")", extras);
    return true;
}

// ----------------------------------------------------------------
// Simulador: unica operacion de borrado permitida
// ----------------------------------------------------------------

/**
 * Elimina SOLO los eventos marcados como simulados (incluidas las
 * alertas y revisiones derivadas de ellos) y deja un evento
 * LOG_SIMULADOS_BORRADOS como constancia. Los eventos reales no se tocan.
 *
 * @returns {number} cantidad de eventos eliminados
 */
function borrarEventosSimulados(sesion) {
    const eventos = obtenerEventos();
    const reales = eventos.filter((e) => e.simulado !== true);
    const eliminados = eventos.length - reales.length;

    if (eliminados > 0) {
        guardarEventos(reales);
    }
    if (sesion) {
        registrarEvento(sesion.correo, sesion.rol, ACCIONES.LOG_SIMULADOS_BORRADOS,
            "EXITO", "Se eliminaron " + eliminados + " eventos simulados");
    }
    return eliminados;
}

// ----------------------------------------------------------------
// Presentacion compartida de alertas (panel y simulador)
// ----------------------------------------------------------------

/**
 * Construye la tarjeta HTML de una alerta. Usa siempre textContent
 * (nunca innerHTML) porque el detalle puede incluir texto ingresado por
 * un usuario, por ejemplo un correo escrito en el login.
 *
 * @param {object} alerta
 * @param {function} [alMarcarRevisada] si se pasa, agrega el boton
 *        "Marcar como revisada" y la llama con el id de la alerta
 */
function crearTarjetaAlerta(alerta, alMarcarRevisada) {
    const tarjeta = document.createElement("div");
    tarjeta.className = "tarjeta-alerta " + (alerta.nivel === "ALTO" ? "nivel-alto" : "nivel-medio");

    const titulo = document.createElement("strong");
    titulo.textContent = "[" + alerta.nivel + "] " + REGLAS_DETECCION[alerta.regla];
    tarjeta.appendChild(titulo);

    if (alerta.simulado) {
        const etiqueta = document.createElement("span");
        etiqueta.className = "etiqueta-simulado";
        etiqueta.textContent = "SIMULADO";
        tarjeta.appendChild(etiqueta);
    }

    const texto = document.createElement("p");
    texto.textContent = alerta.detalle;
    tarjeta.appendChild(texto);

    const pie = document.createElement("div");
    pie.className = "pie-alerta";

    const fecha = document.createElement("small");
    fecha.textContent = new Date(alerta.fecha_hora).toLocaleString("es-EC") +
        " · Usuario: " + alerta.usuario;
    pie.appendChild(fecha);

    if (alMarcarRevisada) {
        const boton = document.createElement("button");
        boton.type = "button";
        boton.className = "boton-chico";
        boton.textContent = "Marcar como revisada";
        boton.addEventListener("click", function () {
            alMarcarRevisada(alerta.id);
        });
        pie.appendChild(boton);
    }

    tarjeta.appendChild(pie);
    return tarjeta;
}
