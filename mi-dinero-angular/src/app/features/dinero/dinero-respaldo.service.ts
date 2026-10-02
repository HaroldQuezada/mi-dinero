import { inject, Injectable } from '@angular/core';
import { esObjeto } from '../../core/almacenamiento-local.service';
import { SUPABASE_CLIENT } from '../../core/supabase';
import { MensajeError } from '../../core/tipos';
import { fechaHoyIso } from '../../core/utils';
import { descargarJson } from '../../shared/utils/archivos';
import { esColoresCategoria } from './dinero-preferencias.service';
import {
  FORMATO_RESPALDO,
  ORDEN_TABLAS_RESPALDO,
  PREFIJO_ARCHIVO_RESPALDO,
  PREFIJO_ARCHIVO_SEGURIDAD,
  TABLAS_DINERO,
  TablaDinero,
  TAMANO_LOTE_ESCRITURA,
  TAMANO_PAGINA_LECTURA,
  VERSION_RESPALDO,
} from './dinero.constantes';
import { ColoresCategoria, ConteoRespaldo, DatosRespaldo, FilaRespaldo, RespaldoDinero } from './dinero.models';
import { DineroPreferenciasService } from './dinero-preferencias.service';
import { DineroService } from './dinero.service';

// Columnas que asigna la BD a cada usuario: no se copian al importar
const COLUMNAS_PROPIETARIO = ['user_id'] as const;

// Referencias entre tablas que hay que traducir al generar ids nuevos
interface Referencia {
  columna: string;
  tabla: TablaDinero;
  // true = si la fila referenciada no está en el respaldo, se descarta la fila
  obligatoria: boolean;
}

const REFERENCIAS: Partial<Record<TablaDinero, readonly Referencia[]>> = {
  [TABLAS_DINERO.subcategorias]: [
    { columna: 'categoria_grande_id', tabla: TABLAS_DINERO.categoriasGrandes, obligatoria: true },
  ],
  // Las cuentas de una transacción son obligatorias cuando vienen (un gasto sin su
  // cuenta de origen no tendría sentido); las que son null según el tipo se respetan
  [TABLAS_DINERO.movimientos]: [
    { columna: 'cuenta_origen_id', tabla: TABLAS_DINERO.cuentas, obligatoria: true },
    { columna: 'cuenta_destino_id', tabla: TABLAS_DINERO.cuentas, obligatoria: true },
    { columna: 'categoria_id', tabla: TABLAS_DINERO.categoriasGrandes, obligatoria: false },
    { columna: 'subcategoria_id', tabla: TABLAS_DINERO.subcategorias, obligatoria: false },
  ],
  [TABLAS_DINERO.gastosFijos]: [
    { columna: 'cuenta_id', tabla: TABLAS_DINERO.cuentas, obligatoria: false },
    { columna: 'categoria_id', tabla: TABLAS_DINERO.categoriasGrandes, obligatoria: false },
    { columna: 'subcategoria_id', tabla: TABLAS_DINERO.subcategorias, obligatoria: false },
  ],
  [TABLAS_DINERO.tarjetaCortes]: [
    { columna: 'cuenta_id', tabla: TABLAS_DINERO.cuentas, obligatoria: true },
    { columna: 'deuda_id', tabla: TABLAS_DINERO.deudas, obligatoria: false },
    { columna: 'movimiento_id', tabla: TABLAS_DINERO.movimientos, obligatoria: false },
  ],
  [TABLAS_DINERO.deudasPagos]: [
    { columna: 'deuda_id', tabla: TABLAS_DINERO.deudas, obligatoria: true },
    { columna: 'movimiento_id', tabla: TABLAS_DINERO.movimientos, obligatoria: false },
  ],
  [TABLAS_DINERO.gastosFijosPagos]: [
    { columna: 'gasto_fijo_id', tabla: TABLAS_DINERO.gastosFijos, obligatoria: true },
    { columna: 'movimiento_id', tabla: TABLAS_DINERO.movimientos, obligatoria: false },
  ],
};

// Columnas mínimas que debe traer cada fila para considerarse válida
const COLUMNAS_REQUERIDAS: Record<TablaDinero, readonly string[]> = {
  [TABLAS_DINERO.configuracion]: ['ingreso_mensual'],
  [TABLAS_DINERO.cuentas]: ['nombre', 'tipo', 'saldo_inicial'],
  [TABLAS_DINERO.categoriasGrandes]: ['nombre', 'porcentaje', 'tipo'],
  [TABLAS_DINERO.subcategorias]: ['nombre', 'categoria_grande_id'],
  [TABLAS_DINERO.metasAhorro]: ['nombre', 'valor_objetivo'],
  [TABLAS_DINERO.tarjetaCortes]: ['cuenta_id', 'mes', 'monto_corte'],
  [TABLAS_DINERO.movimientos]: ['tipo', 'monto', 'fecha'],
  [TABLAS_DINERO.deudas]: ['nombre', 'tipo'],
  [TABLAS_DINERO.deudasPagos]: ['deuda_id', 'mes'],
  [TABLAS_DINERO.gastosFijos]: ['nombre', 'monto'],
  [TABLAS_DINERO.gastosFijosPagos]: ['gasto_fijo_id', 'mes'],
};

type MapaIds = Map<TablaDinero, Map<string, string>>;

function esFilaRespaldo(valor: unknown, requeridas: readonly string[]): valor is FilaRespaldo {
  return (
    esObjeto(valor) &&
    typeof valor['id'] === 'string' &&
    requeridas.every((columna) => columna in valor)
  );
}

// Respaldo de Mi Dinero hecho con una versión que esta app ya no puede importar
export function esRespaldoAntiguo(valor: unknown): boolean {
  return (
    esObjeto(valor) &&
    valor['formato'] === FORMATO_RESPALDO &&
    typeof valor['version'] === 'number' &&
    valor['version'] < VERSION_RESPALDO
  );
}

export function esRespaldoDinero(valor: unknown): valor is RespaldoDinero {
  if (!esObjeto(valor) || valor['formato'] !== FORMATO_RESPALDO) return false;
  if (valor['version'] !== VERSION_RESPALDO) return false;
  const datos = valor['datos'];
  const preferencias = valor['preferencias'];
  return (
    esObjeto(datos) &&
    ORDEN_TABLAS_RESPALDO.every((tabla) => {
      const filas = datos[tabla];
      return Array.isArray(filas) && filas.every((f) => esFilaRespaldo(f, COLUMNAS_REQUERIDAS[tabla]));
    }) &&
    esObjeto(preferencias) &&
    esColoresCategoria(preferencias['coloresCategoria'])
  );
}

export function contarRespaldo(respaldo: RespaldoDinero): ConteoRespaldo {
  return Object.fromEntries(
    ORDEN_TABLAS_RESPALDO.map((tabla) => [tabla, respaldo.datos[tabla].length]),
  ) as ConteoRespaldo;
}

// Exporta todos los datos de Mi Dinero a un archivo JSON portable y los restaura
// desde ese archivo, en esta u otra cuenta/plataforma.
@Injectable({ providedIn: 'root' })
export class DineroRespaldoService {
  private readonly db = inject(SUPABASE_CLIENT);
  private readonly dinero = inject(DineroService);
  private readonly preferencias = inject(DineroPreferenciasService);

  // ============================================
  // EXPORTAR
  // ============================================
  async exportar(prefijoArchivo: string = PREFIJO_ARCHIVO_RESPALDO): Promise<MensajeError> {
    const lecturas = await Promise.all(ORDEN_TABLAS_RESPALDO.map((tabla) => this.leerTabla(tabla)));
    const error = lecturas.find((l) => l.error !== null)?.error;
    if (error) return error;

    const datos = Object.fromEntries(
      ORDEN_TABLAS_RESPALDO.map((tabla, i) => [tabla, lecturas[i].filas]),
    ) as DatosRespaldo;

    const respaldo: RespaldoDinero = {
      formato: FORMATO_RESPALDO,
      version: VERSION_RESPALDO,
      exportadoEn: new Date().toISOString(),
      datos,
      preferencias: { coloresCategoria: this.preferencias.coloresCategoria() },
    };
    descargarJson(`${prefijoArchivo}-${fechaHoyIso()}.json`, respaldo);
    return null;
  }

  // Lee todas las filas de la tabla (RLS limita a las del usuario), paginando
  // porque Supabase devuelve como máximo 1000 por consulta
  private async leerTabla(tabla: TablaDinero): Promise<{ filas: FilaRespaldo[]; error: MensajeError }> {
    const filas: FilaRespaldo[] = [];
    for (let desde = 0; ; desde += TAMANO_PAGINA_LECTURA) {
      const { data, error } = await this.db
        .from(tabla)
        .select('*')
        .order('id', { ascending: true })
        .range(desde, desde + TAMANO_PAGINA_LECTURA - 1)
        .overrideTypes<FilaRespaldo[], { merge: false }>();
      if (error) return { filas: [], error: error.message };
      filas.push(...(data ?? []));
      if (!data || data.length < TAMANO_PAGINA_LECTURA) return { filas, error: null };
    }
  }

  // ============================================
  // IMPORTAR
  // ============================================
  // Reemplaza todos los datos actuales por los del respaldo. Antes descarga una
  // copia de seguridad de lo que hay ahora, por si se importó el archivo equivocado.
  async importar(respaldo: RespaldoDinero): Promise<MensajeError> {
    const errorCopia = await this.exportar(PREFIJO_ARCHIVO_SEGURIDAD);
    if (errorCopia) return `No se pudo crear la copia de seguridad previa: ${errorCopia}`;

    const { datos, colores } = this.prepararDatos(respaldo);

    const errorBorrado = await this.borrarTodo();
    const errorInsercion = errorBorrado ?? (await this.insertarTodo(datos));

    if (!errorInsercion) this.preferencias.coloresCategoria.set(colores);
    await this.dinero.cargarTodo();
    return errorInsercion;
  }

  // Asigna ids nuevos a todas las filas y traduce las referencias entre tablas.
  // Con ids nuevos el archivo se puede importar en otra cuenta sin chocar con los
  // registros originales, que siguen existiendo en la BD con sus propios ids.
  private prepararDatos(respaldo: RespaldoDinero): { datos: DatosRespaldo; colores: ColoresCategoria } {
    const ids: MapaIds = new Map(
      ORDEN_TABLAS_RESPALDO.map((tabla) => [
        tabla,
        new Map(respaldo.datos[tabla].map((fila) => [fila.id, crypto.randomUUID()])),
      ]),
    );

    const datos = Object.fromEntries(
      ORDEN_TABLAS_RESPALDO.map((tabla) => [tabla, this.prepararFilas(tabla, respaldo.datos[tabla], ids)]),
    ) as DatosRespaldo;

    // Solo hay una configuración por usuario
    datos[TABLAS_DINERO.configuracion] = datos[TABLAS_DINERO.configuracion].slice(0, 1);

    const idsCategorias = ids.get(TABLAS_DINERO.categoriasGrandes);
    const colores: ColoresCategoria = {};
    for (const [idViejo, slot] of Object.entries(respaldo.preferencias.coloresCategoria)) {
      const idNuevo = idsCategorias?.get(idViejo);
      if (idNuevo) colores[idNuevo] = slot;
    }
    return { datos, colores };
  }

  private prepararFilas(tabla: TablaDinero, filas: readonly FilaRespaldo[], ids: MapaIds): FilaRespaldo[] {
    const propios = ids.get(tabla);
    const referencias = REFERENCIAS[tabla] ?? [];
    const resultado: FilaRespaldo[] = [];

    for (const original of filas) {
      const fila: FilaRespaldo = { ...original, id: propios?.get(original.id) ?? crypto.randomUUID() };
      for (const columna of COLUMNAS_PROPIETARIO) delete fila[columna];

      let valida = true;
      for (const { columna, tabla: destino, obligatoria } of referencias) {
        const valor = fila[columna];
        if (valor === null || valor === undefined) continue;
        const traducido = typeof valor === 'string' ? ids.get(destino)?.get(valor) : undefined;
        if (traducido) fila[columna] = traducido;
        else if (obligatoria) valida = false;
        else fila[columna] = null;
      }

      if (valida) resultado.push(fila);
    }
    return resultado;
  }

  // Borra de hijas a padres para respetar las llaves foráneas
  private async borrarTodo(): Promise<MensajeError> {
    for (const tabla of [...ORDEN_TABLAS_RESPALDO].reverse()) {
      // Supabase exige un filtro en los DELETE; este abarca todas las filas del usuario
      const { error } = await this.db.from(tabla).delete().not('id', 'is', null);
      if (error) return `No se pudo vaciar ${tabla}: ${error.message}`;
    }
    return null;
  }

  // Inserta de padres a hijas, en lotes para no exceder el tamaño de la petición
  private async insertarTodo(datos: DatosRespaldo): Promise<MensajeError> {
    for (const tabla of ORDEN_TABLAS_RESPALDO) {
      const filas = datos[tabla];
      for (let i = 0; i < filas.length; i += TAMANO_LOTE_ESCRITURA) {
        const { error } = await this.db.from(tabla).insert(filas.slice(i, i + TAMANO_LOTE_ESCRITURA));
        if (error) return `No se pudo importar ${tabla}: ${error.message}`;
      }
    }
    return null;
  }
}
