import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { User } from '@supabase/supabase-js';
import { PerfilRegistro } from './auth.models';
import { RUTAS } from './constantes';
import { SUPABASE_CLIENT } from './supabase';
import { MensajeError } from './tipos';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly db = inject(SUPABASE_CLIENT);
  private readonly router = inject(Router);

  private readonly usuarioActual = signal<User | null>(null);
  readonly usuario = this.usuarioActual.asReadonly();

  // Solo cambia cuando cambia el usuario (no en cada refresco de token)
  readonly usuarioId = computed<string | null>(() => this.usuarioActual()?.id ?? null);

  constructor() {
    // Supabase emite INITIAL_SESSION al suscribirse, así que no hace falta getSession() aparte
    this.db.auth.onAuthStateChange((_evento, sesion) => {
      this.usuarioActual.set(sesion?.user ?? null);
    });
  }

  async haySesion(): Promise<boolean> {
    const { data } = await this.db.auth.getSession();
    return data.session !== null;
  }

  async iniciarSesion(email: string, password: string): Promise<MensajeError> {
    const { error } = await this.db.auth.signInWithPassword({ email, password });
    if (error) return traducirErrorLogin(error.message);
    await this.router.navigateByUrl(RUTAS.inicio);
    return null;
  }

  async crearCuenta(email: string, password: string, perfil: PerfilRegistro): Promise<MensajeError> {
    const { error } = await this.db.auth.signUp({ email, password, options: { data: perfil } });
    return error ? traducirErrorRegistro(error.message) : null;
  }

  async cerrarSesion(): Promise<void> {
    await this.db.auth.signOut();
    await this.router.navigateByUrl(RUTAS.auth);
  }
}

// Traduce errores comunes de Supabase a mensajes amigables
function traducirErrorLogin(error: string): string {
  const e = error.toLowerCase();
  if (e.includes('invalid login') || e.includes('invalid email or password')) {
    return 'Usuario o contraseña incorrectos.';
  }
  if (e.includes('email not confirmed')) {
    return 'Debes confirmar tu correo antes de entrar. Revisa tu bandeja.';
  }
  if (e.includes('too many')) {
    return 'Demasiados intentos. Espera un momento e inténtalo de nuevo.';
  }
  return error;
}

function traducirErrorRegistro(error: string): string {
  const e = error.toLowerCase();
  if (e.includes('already registered') || e.includes('user already exists')) {
    return 'Este correo ya está registrado. Inicia sesión.';
  }
  if (e.includes('password should be')) {
    return 'La contraseña no cumple los requisitos mínimos.';
  }
  if (e.includes('invalid email')) return 'El correo no es válido.';
  return error;
}
