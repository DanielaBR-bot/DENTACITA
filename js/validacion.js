/**
 * validacion.js
 * -----------------------------------------------------------
 * Reglas de validacion y saneamiento de datos de entrada.
 * Se usa principalmente en el formulario de login (index.html),
 * pero las funciones son genericas y se pueden reutilizar en
 * cualquier otra pantalla del proyecto.
 * -----------------------------------------------------------
 */

// Expresion regular simple para correos: usuario@dominio.algo
const PATRON_CORREO = /^[^\s@<>"'&]+@[^\s@<>"'&]+\.[^\s@<>"'&]+$/;

// La contrasena debe tener entre 8 y 64 caracteres, al menos
// una mayuscula, una minuscula y un numero.
const PATRON_CONTRASENA = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,64}$/;

/**
 * Quita espacios al inicio/fin de un texto.
 * Es el primer paso antes de validar o guardar cualquier campo.
 */
function limpiarEspacios(texto) {
    return (texto || "").trim();
}

/**
 * Escapa los caracteres especiales < > " ' & para que, si el texto
 * se llega a mostrar en pantalla, el navegador no lo interprete
 * como HTML/JS. Esto es una defensa adicional contra XSS.
 *
 * Importante: en este proyecto NUNCA usamos innerHTML con datos
 * ingresados por el usuario; siempre usamos textContent. Esta
 * funcion se deja disponible como capa extra de seguridad y para
 * los casos en que se necesite mostrar el texto dentro de atributos
 * o mensajes armados como string.
 */
function escaparHTML(texto) {
    return (texto || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/**
 * Valida el correo electronico.
 * Devuelve null si es valido, o el mensaje de error si no lo es.
 */
function validarCorreo(correo) {
    const valor = limpiarEspacios(correo);

    if (!valor) {
        return "Ingrese un correo válido";
    }
    if (valor.length > 60) {
        return "Ingrese un correo válido";
    }
    if (!PATRON_CORREO.test(valor)) {
        return "Ingrese un correo válido";
    }
    return null;
}

/**
 * Valida la contrasena segun las reglas del proyecto.
 * Devuelve null si es valida, o el mensaje de error si no lo es.
 */
function validarContrasena(contrasena) {
    const valor = limpiarEspacios(contrasena);

    if (!valor) {
        return "La contraseña no cumple los requisitos";
    }
    if (!PATRON_CONTRASENA.test(valor)) {
        return "La contraseña no cumple los requisitos";
    }
    return null;
}

/**
 * Verifica si el texto ingresado contiene caracteres que podrian
 * usarse para un intento de inyeccion HTML/JS. No se usa para
 * bloquear el envio del formulario (el escape ya lo neutraliza),
 * pero sirve para dejar evidencia en el registro de eventos.
 */
function contieneCaracteresSospechosos(texto) {
    return /[<>"'&]/.test(texto || "");
}
