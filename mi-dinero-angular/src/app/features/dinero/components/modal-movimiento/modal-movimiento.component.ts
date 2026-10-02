import { Component, computed, inject, input, linkedSignal, output, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { NotificacionService } from '../../../../core/notificacion.service';
import { fechaHoyIso } from '../../../../core/utils';
import { CampoFechaComponent } from '../../../../shared/components/campo-fecha/campo-fecha.component';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { ToggleOpcionesComponent } from '../../../../shared/components/toggle-opciones/toggle-opciones.component';
import { ICONOS } from '../../../../shared/iconos';
import { construirTransaccion } from '../../dinero.calculos';
import {
  CUENTAS_POR_TIPO,
  ETIQUETAS_TIPO_MOVIMIENTO,
  TIPO_MOVIMIENTO_POR_DEFECTO,
  TIPOS_MOVIMIENTO,
} from '../../dinero.constantes';
import {
  BorradorTransaccion,
  SeleccionCategoria,
  TipoCategoria,
  TipoMovimiento,
  Transaccion,
} from '../../dinero.models';
import { DineroService } from '../../dinero.service';
import { SelectorCategoriaComponent } from '../selector-categoria/selector-categoria.component';
import { SelectorCuentaComponent } from '../selector-cuenta/selector-cuenta.component';

const SIN_CATEGORIA: SeleccionCategoria = { categoriaId: null, subcategoriaId: null };

// Formulario de transacción. Los campos dependen del tipo:
//  - GASTO:    cuenta de origen + categoría       (resta del origen)
//  - INGRESO:  cuenta de destino + categoría      (suma al destino)
//  - TRASLADO: cuenta de origen + cuenta destino  (sin categoría; no cambia el patrimonio)
@Component({
  selector: 'app-modal-movimiento',
  imports: [
    FormsModule,
    FaIconComponent,
    CampoFechaComponent,
    ModalComponent,
    ToggleOpcionesComponent,
    SelectorCategoriaComponent,
    SelectorCuentaComponent,
  ],
  templateUrl: './modal-movimiento.component.html',
})
export class ModalMovimientoComponent {
  protected readonly service = inject(DineroService);
  private readonly notificacion = inject(NotificacionService);

  // null = crear una transacción nueva
  readonly movimiento = input<Transaccion | null>(null);
  // Tipo con el que se abre al crear (p. ej. TRASLADO desde la pestaña Cuentas)
  readonly tipoInicial = input<TipoMovimiento>(TIPO_MOVIMIENTO_POR_DEFECTO);
  // Cuenta de origen con la que se abre al crear (p. ej. "Trasladar" desde una cuenta)
  readonly cuentaOrigenInicial = input<string | null>(null);
  readonly cerrar = output<void>();

  // Se cierra a través del modal para que se vea la animación de salida
  private readonly modal = viewChild.required(ModalComponent);

  protected readonly iconos = ICONOS;
  protected readonly tiposMovimiento = TIPOS_MOVIMIENTO;

  protected readonly tipo = linkedSignal<TipoMovimiento>(
    () => this.movimiento()?.tipo ?? this.tipoInicial(),
  );
  protected readonly monto = linkedSignal<number | null>(() => this.movimiento()?.monto ?? null);
  protected readonly fecha = linkedSignal<string>(() => this.movimiento()?.fecha ?? fechaHoyIso());
  protected readonly descripcion = linkedSignal<string>(() => this.movimiento()?.descripcion ?? '');
  protected readonly cuentaOrigenId = linkedSignal<string | null>(() => {
    const movimiento = this.movimiento();
    if (movimiento) return movimiento.cuenta_origen_id;
    return this.cuentaOrigenInicial() ?? this.service.cuentaPrincipalId();
  });
  protected readonly cuentaDestinoId = linkedSignal<string | null>(() => {
    const movimiento = this.movimiento();
    if (movimiento) return movimiento.cuenta_destino_id;
    // Un ingreso nuevo entra por defecto a la cuenta principal
    return this.tipoInicial() === 'INGRESO' ? this.service.cuentaPrincipalId() : null;
  });
  protected readonly categoria = linkedSignal<SeleccionCategoria>(() => {
    const movimiento = this.movimiento();
    return movimiento
      ? { categoriaId: movimiento.categoria_id, subcategoriaId: movimiento.subcategoria_id }
      : SIN_CATEGORIA;
  });

  // Qué campos muestra el formulario según el tipo
  protected readonly pideOrigen = computed<boolean>(() => CUENTAS_POR_TIPO[this.tipo()].origen);
  protected readonly pideDestino = computed<boolean>(() => CUENTAS_POR_TIPO[this.tipo()].destino);
  protected readonly tipoCategoria = computed<TipoCategoria | null>(() => {
    const tipo = this.tipo();
    return tipo === 'TRASLADO' ? null : tipo;
  });

  protected readonly titulo = computed<string>(() => {
    const accion = this.movimiento() ? 'Editar' : 'Registrar';
    return `${accion} ${ETIQUETAS_TIPO_MOVIMIENTO[this.tipo()].toLowerCase()}`;
  });

  protected readonly etiquetaOrigen = computed<string>(() =>
    this.tipo() === 'TRASLADO' ? 'Desde la cuenta' : 'Pagado con',
  );
  protected readonly etiquetaDestino = computed<string>(() =>
    this.tipo() === 'TRASLADO' ? 'Hacia la cuenta' : 'Recibido en',
  );

  // Al cambiar de tipo: las categorías de gasto e ingreso son distintas, y la cuenta
  // principal pasa al lado que corresponde (origen en gastos, destino en ingresos)
  protected cambiarTipo(tipo: TipoMovimiento): void {
    const anterior = this.tipo();
    if (anterior === tipo) return;
    this.tipo.set(tipo);
    this.categoria.set(SIN_CATEGORIA);

    const principal = this.service.cuentaPrincipalId();
    if (tipo === 'INGRESO' && !this.cuentaDestinoId()) {
      this.cuentaDestinoId.set(this.cuentaOrigenId() ?? principal);
    }
    if (tipo !== 'INGRESO' && !this.cuentaOrigenId()) {
      this.cuentaOrigenId.set(this.cuentaDestinoId() ?? principal);
    }
    // En un traslado el destino no puede ser el mismo origen
    if (tipo === 'TRASLADO' && this.cuentaDestinoId() === this.cuentaOrigenId()) {
      this.cuentaDestinoId.set(null);
    }
  }

  // Intercambia origen y destino de un traslado
  protected invertirCuentas(): void {
    const origen = this.cuentaOrigenId();
    this.cuentaOrigenId.set(this.cuentaDestinoId());
    this.cuentaDestinoId.set(origen);
  }

  protected async guardar(): Promise<void> {
    const borrador: BorradorTransaccion = {
      tipo: this.tipo(),
      monto: this.monto(),
      fecha: this.fecha(),
      cuentaOrigenId: this.cuentaOrigenId(),
      cuentaDestinoId: this.cuentaDestinoId(),
      categoria: this.categoria(),
      descripcion: this.descripcion(),
    };
    const resultado = construirTransaccion(borrador);
    if (!resultado.ok) {
      this.notificacion.informar(resultado.error);
      return;
    }

    const error = await this.service.guardarTransaccion(resultado.valor, this.movimiento()?.id);
    if (error) {
      this.notificacion.error(error);
      return;
    }
    this.modal().cerrarAnimado();
  }
}
