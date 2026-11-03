import { signal } from '@angular/core';
import { signInWithRedirect } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';

export const falloIngreso = signal<string | null>(null);

// Se registra ANTES de configurar Amplify: el fallo puede llegar antes de crear el callback.
export function observarResultadoIngreso(): () => void {
  return Hub.listen('auth', ({ payload }) => {
    if (payload.event === 'signInWithRedirect_failure') {
      falloIngreso.set(describirFallo(payload.data));
    } else if (payload.event === 'signInWithRedirect' || payload.event === 'signedIn') {
      falloIngreso.set(null);
    }
  });
}

export async function iniciarIngreso(): Promise<void> {
  falloIngreso.set(null);
  try {
    await signInWithRedirect();
  } catch (error) {
    falloIngreso.set(describirFallo(error));
    throw error;
  }
}

function describirFallo(error: unknown): string {
  const e = error as { name?: string; message?: string } | undefined;
  const mensaje = e?.message ?? '';
  if (/validating the state|state.*mismatch/i.test(mensaje)) {
    return 'El estado del acceso no coincide con el guardado en esta pestaña.';
  }
  if (/invalid_grant/i.test(mensaje)) return 'Cognito rechazó el código de acceso (invalid_grant).';
  if (/fetch|network/i.test(mensaje)) return 'No se pudo conectar con Cognito para completar el acceso.';
  // Solo se muestra el nombre del error, nunca codigos, tokens ni URLs de autenticacion.
  const nombre = e?.name && /^[A-Za-z_]{1,60}$/.test(e.name) ? ` (${e.name})` : '';
  return `Cognito no pudo completar el acceso${nombre}.`;
}
