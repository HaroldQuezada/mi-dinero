import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { NotificacionService } from '../../../../core/notificacion.service';
import { ICONOS } from '../../../../shared/iconos';
import { leerArchivoJson } from '../../../../shared/utils/archivos';
import {
  contarRespaldo,
  DineroRespaldoService,
  esRespaldoAntiguo,
  esRespaldoDinero,
} from '../../dinero-respaldo.service';
import { TABLAS_DINERO } from '../../dinero.constantes';

// Menú del encabezado para exportar / importar todos los datos de Mi Dinero en JSON
@Component({
  selector: 'app-menu-respaldo',
  imports: [MatMenuModule, FaIconComponent],
  templateUrl: './menu-respaldo.component.html',
})
export class MenuRespaldoComponent {
  private readonly respaldo = inject(DineroRespaldoService);
  private readonly notificacion = inject(NotificacionService);

  private readonly selectorArchivo = viewChild.required<ElementRef<HTMLInputElement>>('selectorArchivo');

  protected readonly iconos = ICONOS;
  protected readonly ocupado = signal(false);

  protected async exportar(): Promise<void> {
    this.ocupado.set(true);
    const error = await this.respaldo.exportar();
    this.ocupado.set(false);
    if (error) this.notificacion.error(error);
  }

  protected elegirArchivo(): void {
    this.selectorArchivo().nativeElement.click();
  }

  protected async importar(): Promise<void> {
    const entrada = this.selectorArchivo().nativeElement;
    const archivo = entrada.files?.[0];
    // Se limpia para que elegir el mismo archivo otra vez vuelva a disparar el cambio
    entrada.value = '';
    if (!archivo) return;

    const contenido = await leerArchivoJson(archivo);
    if (esRespaldoAntiguo(contenido)) {
      this.notificacion.informar(
        'Este respaldo es de una versión anterior (sin cuentas) y no se puede importar. ' +
          'Exporta uno nuevo desde la versión actual.',
      );
      return;
    }
    if (!esRespaldoDinero(contenido)) {
      this.notificacion.informar('El archivo no es un respaldo válido de Mi Dinero.');
      return;
    }

    const conteo = contarRespaldo(contenido);
    const confirmado = this.notificacion.confirmar(
      `El respaldo contiene ${conteo[TABLAS_DINERO.cuentas]} cuentas, ` +
        `${conteo[TABLAS_DINERO.movimientos]} movimientos, ` +
        `${conteo[TABLAS_DINERO.deudas]} deudas, ${conteo[TABLAS_DINERO.gastosFijos]} gastos fijos ` +
        `y ${conteo[TABLAS_DINERO.categoriasGrandes]} categorías.\n\n` +
        'Importarlo REEMPLAZARÁ todos tus datos actuales de Mi Dinero. ' +
        'Antes se descargará automáticamente una copia de seguridad de lo que tienes ahora.\n\n¿Continuar?',
    );
    if (!confirmado) return;

    this.ocupado.set(true);
    const error = await this.respaldo.importar(contenido);
    this.ocupado.set(false);
    if (error) {
      this.notificacion.error(error);
      return;
    }
    this.notificacion.informar('Datos importados correctamente.');
  }
}
