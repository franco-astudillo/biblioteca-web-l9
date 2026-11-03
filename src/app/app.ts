import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { signInWithRedirect, fetchAuthSession } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';

type PrestamoConLibro = {
  id: number; desde: string; hasta: string; devuelto: boolean;
  libro: { id: number; titulo: string; autor: string };
};

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  private readonly http = inject(HttpClient);

  // La caja que mira la plantilla. Empieza en false: sin sesion, no eres nadie.
  protected readonly esBibliotecario = signal(false);

  readonly panel = signal<PrestamoConLibro[]>([]);
  readonly cargando = signal(false);

  constructor() {
    this.revisarGrupos();

    Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signInWithRedirect' || payload.event === 'signedOut') {
        this.revisarGrupos();
      }
    });
  }

  private async revisarGrupos() {
    try {
      const { tokens } = await fetchAuthSession();
      const grupos = (tokens?.accessToken?.payload['cognito:groups'] ?? []) as string[];
      this.esBibliotecario.set(grupos.includes('bibliotecarios'));
    } catch {
      this.esBibliotecario.set(false);
    }
  }

  protected async entrar() {
    await signInWithRedirect();
  }

  cargarPanel(): void {
    this.cargando.set(true);
    this.http
      .get<{ prestamos: PrestamoConLibro[] }>('http://localhost:8080/v1/panel')
      .subscribe({
        next: (r) => { this.panel.set(r.prestamos); this.cargando.set(false); },
        error: (e) => { console.error('el panel fallo:', e.status, e.error); this.cargando.set(false); },
      });
  }

  pedirPrestamo(libroId: number): void {
    this.http
      .post('http://localhost:8080/v1/panel/prestamos', { libroId })
      .subscribe({
        next: () => this.cargarPanel(),
        error: (e) => console.error('el prestamo fallo:', e.status, e.error),
      });
  }
}
