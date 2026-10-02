import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./features/inicio/inicio.component').then((m) => m.InicioComponent),
  },
  {
    path: 'auth',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/auth.component').then((m) => m.AuthComponent),
  },
  {
    path: 'dinero',
    canActivate: [authGuard],
    loadComponent: () => import('./features/dinero/dinero.component').then((m) => m.DineroComponent),
  },
  {
    path: 'habitos',
    canActivate: [authGuard],
    loadComponent: () => import('./features/habitos/habitos.component').then((m) => m.HabitosComponent),
  },
  { path: '**', redirectTo: '' },
];
