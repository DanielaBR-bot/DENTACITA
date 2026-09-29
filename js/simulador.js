/**
 * simulador.js
 * -----------------------------------------------------------
 * Escenarios del simulador de incidentes de DentaCita (solo administrador).
 *
 * Cada escenario genera eventos con el mismo formato que los reales, pero
 * marcados como simulados (simulado: true, detalle que empieza con
 * "SIMULADO") y agrupados en una "corrida" propia. Los eventos se envian
 * por registrarEvento(), asi que el sistema les aplica las mismas reglas
 * de deteccion que a la actividad real.
 *
 * Los escenarios NO tocan cuentas ni bloqueos reales: no modifican
 * dentacita_bloqueos ni la sesion de nadie. Solo escriben en el registro.
 *
 * Depende de: js/logs.js (registrarEvento, generarId, ACCIONES, ...)
 * -----------------------------------------------------------
 */

const PREFIJO_SIMULADO = "SIMULADO – ";

/**
 * Registra un evento simulado dentro de una corrida.
 *
 * @param {string} corrida     Id de la corrida (agrupa los eventos del escenario)
 * @param {Date}   momento     Fecha y hora que tendra el evento
 * @param {object} [extras]    Campos opcionales, por ejemplo { sesion_id }
 */
function registrarEventoSimulado(corrida, momento, usuario, rol, accion, resultado, detalle, extras) {
    const opciones = Object.assign({
        simulado: true,
        corrida: corrida,
        fecha_hora: momento.toISOString()
    }, extras || {});

    return registrarEvento(usuario, rol, accion, resultado,
        PREFIJO_SIMULADO + detalle, opciones);
}

/**
 * Escenario 1: fuerza bruta contra recepcion@sonrisa.ec.
 * 5 intentos fallidos en 1 minuto: los 2 primeros son LOGIN_FALLIDO, el
 * tercero provoca el bloqueo y los otros 2 chocan con la cuenta bloqueada
 * (igual que ocurriria con el login real).
 */
function simularFuerzaBruta() {
    const corrida = generarId("SIM");
    const correo = "recepcion@sonrisa.ec";
    const ahora = Date.now();

    for (let intento = 1; intento <= 5; intento++) {
        // Un intento cada 14 segundos: 56 segundos entre el primero y el ultimo.
        const momento = new Date(ahora - (5 - intento) * 14000);

        if (intento <= 2) {
            registrarEventoSimulado(corrida, momento, correo, "desconocido",
                ACCIONES.LOGIN_FALLIDO, "FALLO", "Intento " + intento + " de 3");
        } else if (intento === 3) {
            registrarEventoSimulado(corrida, momento, correo, "desconocido",
                ACCIONES.CUENTA_BLOQUEADA, "FALLO",
                "Cuenta bloqueada tras 3 intentos fallidos");
        } else {
            registrarEventoSimulado(corrida, momento, correo, "desconocido",
                ACCIONES.CUENTA_BLOQUEADA, "FALLO",
                "Intento de acceso mientras la cuenta esta bloqueada");
        }
    }
    return corrida;
}

/**
 * Escenario 2: ingreso de recepcion@sonrisa.ec a las 23:40 (fuera de
 * horario). Se usa la fecha de hoy; si las 23:40 de hoy todavia no
 * llegaron, se usa la de ayer para que el evento no quede en el futuro.
 */
function simularAccesoFueraDeHorario() {
    const corrida = generarId("SIM");
    const correo = "recepcion@sonrisa.ec";

    const momento = new Date();
    momento.setHours(23, 40, 0, 0);
    if (momento.getTime() > Date.now()) {
        momento.setDate(momento.getDate() - 1);
    }

    registrarEventoSimulado(corrida, momento, correo, "recepcionista",
        ACCIONES.LOGIN_EXITOSO, "EXITO", "Inicio de sesión correcto");

    // Igual que el login real, deja tambien el evento de acceso fuera de horario.
    registrarEventoSimulado(corrida, new Date(momento.getTime() + 1000), correo, "recepcionista",
        ACCIONES.ACCESO_FUERA_HORARIO, "ALERTA",
        "Inicio de sesión fuera del horario de atención (08:00-18:00)");

    return corrida;
}

/**
 * Escenario 3: paciente1@sonrisa.ec intenta abrir panel-logs.html y
 * simulador.html (paginas exclusivas del administrador) en la misma sesion.
 */
function simularEscalamientoPrivilegios() {
    const corrida = generarId("SIM");
    const correo = "paciente1@sonrisa.ec";
    const sesionSimulada = generarId("SES-SIM");
    const ahora = Date.now();

    const paginas = ["panel-logs.html", "simulador.html"];
    paginas.forEach((pagina, indice) => {
        const momento = new Date(ahora - (paginas.length - 1 - indice) * 20000);
        registrarEventoSimulado(corrida, momento, correo, "paciente",
            ACCIONES.ACCESO_DENEGADO, "FALLO",
            "Intento de acceso no autorizado a " + pagina,
            { sesion_id: sesionSimulada });
    });
    return corrida;
}

/**
 * Escenario 4: enumeracion de cuentas. Un mismo atacante prueba 4 correos
 * que no existen, con un intento fallido cada uno.
 */
function simularEnumeracionCuentas() {
    const corrida = generarId("SIM");
    const correosInexistentes = [
        "gerente@sonrisa.ec",
        "director@sonrisa.ec",
        "soporte@sonrisa.ec",
        "contabilidad@sonrisa.ec"
    ];
    const ahora = Date.now();

    correosInexistentes.forEach((correo, indice) => {
        const momento = new Date(ahora - (correosInexistentes.length - 1 - indice) * 15000);
        registrarEventoSimulado(corrida, momento, correo, "desconocido",
            ACCIONES.LOGIN_FALLIDO, "FALLO", "Intento 1 de 3");
    });
    return corrida;
}

/**
 * Devuelve la cantidad de eventos generados y las alertas resultantes
 * de una corrida, para mostrarlas despues de simular.
 */
function resumirCorrida(corrida) {
    const eventos = obtenerEventos().filter((e) => e.corrida === corrida);
    return {
        totalEventos: eventos.length,
        alertas: ordenarRecientesPrimero(
            eventos.filter((e) => e.accion === ACCIONES.ALERTA_SEGURIDAD))
    };
}
