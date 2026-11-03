import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  sesion: vi.fn(),
  ingresar: vi.fn(),
  salir: vi.fn(),
  escuchar: undefined as undefined | ((evento: { payload: { event: string; data?: unknown } }) => void),
}));
vi.mock('aws-amplify/auth', () => ({ fetchAuthSession: auth.sesion, signInWithRedirect: auth.ingresar }));
vi.mock('aws-amplify/auth/enable-oauth-listener', () => ({}));
vi.mock('aws-amplify/utils', () => ({
  Hub: { listen: vi.fn((_canal, escuchar) => { auth.escuchar = escuchar; return auth.salir; }) },
}));
import { Callback } from './callback';
import { falloIngreso, observarResultadoIngreso } from '../auth/resultado-ingreso';

describe('regreso de Cognito', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    falloIngreso.set(null);
    window.history.replaceState(null, '', '/callback');
    TestBed.configureTestingModule({ imports: [Callback], providers: [provideRouter([])] });
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.useRealTimers(); });

  it('sale al catalogo y reemplaza la URL si la sesion ya termino', async () => {
    auth.sesion.mockResolvedValue({ tokens: { accessToken: {} } });
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(Callback);
    fixture.detectChanges();
    await Promise.resolve();
    expect(navegar).toHaveBeenCalledWith('/libros', { replaceUrl: true });
  });

  it('indica como entrar cuando no hay codigo ni sesion', async () => {
    auth.sesion.mockResolvedValue({});
    const fixture = TestBed.createComponent(Callback);
    await Promise.resolve(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Necesitas iniciar sesión');
  });

  it('un codigo sin sesion ofrece reintentar y no acusa que falte un import', async () => {
    window.history.replaceState(null, '', '/callback?code=ejemplo');
    auth.sesion.mockResolvedValue({});
    const fixture = TestBed.createComponent(Callback);
    await Promise.resolve(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No se pudo completar');
    expect(fixture.nativeElement.textContent).not.toContain('src/main.ts');
  });

  it('resuelve el acceso si el Hub avisa despues de crear la pagina', () => {
    auth.sesion.mockReturnValue(new Promise(() => undefined));
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    TestBed.createComponent(Callback);
    auth.escuchar?.({ payload: { event: 'signInWithRedirect' } });
    expect(navegar).toHaveBeenCalledWith('/libros', { replaceUrl: true });
  });

  it('muestra el fallo del Hub y libera la suscripcion al salir', () => {
    auth.sesion.mockReturnValue(new Promise(() => undefined));
    const fixture = TestBed.createComponent(Callback);
    auth.escuchar?.({ payload: { event: 'signInWithRedirect_failure' } });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    fixture.destroy();
    expect(auth.salir).toHaveBeenCalledOnce();
  });

  it('ofrece reintentar si el canje queda esperando mas de 20 segundos', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    auth.sesion.mockReturnValue(new Promise(() => undefined));
    const fixture = TestBed.createComponent(Callback);
    await vi.advanceTimersByTimeAsync(20000);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('conserva el motivo si Cognito fallo antes de crear el callback', async () => {
    auth.sesion.mockResolvedValue({});
    const cancelar = observarResultadoIngreso();
    auth.escuchar?.({ payload: { event: 'signInWithRedirect_failure', data: new Error('invalid_grant') } });
    const fixture = TestBed.createComponent(Callback);
    await Promise.resolve(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Cognito rechazó el código');
    cancelar();
  });

  it('el boton inicia un flujo nuevo en vez de recargar el codigo anterior', async () => {
    window.history.replaceState(null, '', '/callback?code=ejemplo');
    auth.sesion.mockResolvedValue({});
    auth.ingresar.mockResolvedValue(undefined);
    const fixture = TestBed.createComponent(Callback);
    await Promise.resolve(); fixture.detectChanges();
    fixture.nativeElement.querySelector('button').click();
    await Promise.resolve();
    expect(auth.ingresar).toHaveBeenCalledOnce();
  });
});
