import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';
import { RUTAS } from './constantes';

// Protege rutas que requieren sesión: redirige a /auth si no hay usuario.
export const authGuard: CanActivateFn = async (): Promise<boolean | UrlTree> => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return (await auth.haySesion()) ? true : router.parseUrl(RUTAS.auth);
};

// Protege /auth: si ya hay sesión, manda al inicio.
export const guestGuard: CanActivateFn = async (): Promise<boolean | UrlTree> => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return (await auth.haySesion()) ? router.parseUrl(RUTAS.inicio) : true;
};
