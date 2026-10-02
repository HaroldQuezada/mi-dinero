// Utilidades para descargar y leer archivos locales desde el navegador

const TIPO_JSON = 'application/json';
const ESPACIOS_INDENTACION = 2;

export function descargarJson(nombreArchivo: string, datos: unknown): void {
  const contenido = JSON.stringify(datos, null, ESPACIOS_INDENTACION);
  const url = URL.createObjectURL(new Blob([contenido], { type: TIPO_JSON }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  enlace.click();
  // Se libera en el siguiente ciclo para no cancelar la descarga en algunos navegadores
  setTimeout(() => URL.revokeObjectURL(url));
}

// Devuelve el contenido parseado, o null si el archivo no es JSON válido
export async function leerArchivoJson(archivo: File): Promise<unknown> {
  try {
    return JSON.parse(await archivo.text()) as unknown;
  } catch {
    return null;
  }
}
