import { Component, inject, OnDestroy, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { fetchAuthSession } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import 'aws-amplify/auth/enable-oauth-listener';
import { falloIngreso, iniciarIngreso } from '../auth/resultado-ingreso';

@Component({
  selector: 'app-callback',
  imports: [RouterLink],
  templateUrl: './callback.html',
})
export class Callback implements OnDestroy {
  private readonly router = inject(Router);
  private readonly dejarDeEscuchar: () => void;
  private readonly limite: ReturnType<typeof setTimeout>;
  private destruido = false;

  protected readonly estado = signal<'procesando' | 'sin-sesion' | 'error'>('procesando');
  protected readonly detalle = falloIngreso;

  constructor() {
    // El evento puede llegar despues de crear el componente o la sesion ya puede existir.
    this.dejarDeEscuchar = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signInWithRedirect' || payload.event === 'signedIn') {
        this.terminar();
      } else if (payload.event === 'signInWithRedirect_failure') {
        this.estado.set('error');
      }
    });
    this.limite = setTimeout(() => {
      falloIngreso.set('El acceso no terminó en 20 segundos. Puedes iniciar uno nuevo.');
      this.estado.set('error');
    }, 20000);
    void this.siYaHaySesion();
  }

  private async siYaHaySesion(): Promise<void> {
    try {
      const { tokens } = await fetchAuthSession();
      if (this.destruido) return;
      if (tokens?.accessToken) {
        this.terminar();
      } else {
        clearTimeout(this.limite);
        const parametros = new URLSearchParams(window.location.search);
        if (parametros.has('code') && !falloIngreso()) {
          falloIngreso.set('No se encontró una sesión asociada a este regreso de Cognito.');
        }
        this.estado.set(falloIngreso() || parametros.has('code') || parametros.has('error') ? 'error' : 'sin-sesion');
      }
    } catch {
      if (!this.destruido) {
        clearTimeout(this.limite);
        this.estado.set('error');
      }
    }
  }

  protected async reintentar(): Promise<void> {
    this.estado.set('procesando');
    try { await iniciarIngreso(); } catch { this.estado.set('error'); }
  }

  private terminar(): void {
    if (this.destruido) return;
    clearTimeout(this.limite);
    // Quita el codigo de la URL y evita volver a un callback ya utilizado con el boton Atras.
    void this.router.navigateByUrl('/libros', { replaceUrl: true });
  }

  ngOnDestroy(): void {
    this.destruido = true;
    clearTimeout(this.limite);
    this.dejarDeEscuchar();
  }
}
