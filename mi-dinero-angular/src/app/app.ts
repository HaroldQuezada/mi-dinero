import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TemaService } from './core/tema.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
})
export class App {
  constructor() {
    // Se inyecta aquí para que el tema quede aplicado desde el arranque en todas las rutas
    inject(TemaService);
  }
}
