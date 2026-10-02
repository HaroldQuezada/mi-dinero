import { Injectable } from '@angular/core';
import { MatDateFormats, NativeDateAdapter } from '@angular/material/core';

// DD/MM/AAAA (también acepta - o . como separador)
const PATRON_FECHA_LOCAL = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;

const LUNES = 1;

// El adaptador nativo interpreta "05/10/2026" como 10 de mayo (formato de EE. UU.).
// Este lo interpreta como día/mes/año, que es lo que escribe un usuario en Colombia.
@Injectable()
export class AdaptadorFechaLocal extends NativeDateAdapter {
  override parse(valor: unknown, formato: object): Date | null {
    if (typeof valor === 'string') {
      const coincidencia = valor.trim().match(PATRON_FECHA_LOCAL);
      if (coincidencia) {
        const [, dia, mes, anio] = coincidencia.map(Number);
        const fecha = new Date(anio, mes - 1, dia);
        // Rechaza fechas imposibles como 31/02 en lugar de desbordarlas al mes siguiente
        return fecha.getMonth() === mes - 1 ? fecha : this.invalid();
      }
    }
    return super.parse(valor, formato);
  }

  override getFirstDayOfWeek(): number {
    return LUNES;
  }
}

export const FORMATOS_FECHA: MatDateFormats = {
  parse: { dateInput: null },
  display: {
    dateInput: { day: '2-digit', month: '2-digit', year: 'numeric' },
    monthYearLabel: { year: 'numeric', month: 'short' },
    dateA11yLabel: { year: 'numeric', month: 'long', day: 'numeric' },
    monthYearA11yLabel: { year: 'numeric', month: 'long' },
  },
};

export const FORMATOS_MES: MatDateFormats = {
  parse: { dateInput: null },
  display: {
    ...FORMATOS_FECHA.display,
    dateInput: { year: 'numeric', month: 'long' },
  },
};
