import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NOMBRE_APP, RUTAS } from '../../core/constantes';
import { BotonTemaComponent } from '../../shared/components/boton-tema/boton-tema.component';
import { PageFooterComponent } from '../../shared/components/page-footer/page-footer.component';

interface ModuloInicio {
  ruta: string;
  icono: string;
  titulo: string;
  descripcion: string;
}

const MODULOS: readonly ModuloInicio[] = [
  {
    ruta: RUTAS.dinero,
    icono: '💰',
    titulo: 'Mi Dinero',
    descripcion: 'Ingresos, gastos, deudas y presupuesto',
  },
  {
    ruta: RUTAS.habitos,
    icono: '✅',
    titulo: 'Mis Hábitos',
    descripcion: 'Rutinas y organización diaria',
  },
];

@Component({
  selector: 'app-inicio',
  imports: [RouterLink, BotonTemaComponent, PageFooterComponent],
  templateUrl: './inicio.component.html',
  styleUrl: './inicio.component.css',
  host: { class: 'pagina' },
})
export class InicioComponent {
  protected readonly nombreApp = NOMBRE_APP;
  protected readonly modulos = MODULOS;
}
