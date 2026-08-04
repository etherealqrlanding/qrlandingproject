// No cancela la promesa original (no hay AbortController disponible en toda la cadena
// supabase-js + fetch), solo evita que la UI quede esperando indefinidamente sin feedback
// si la red está caída — usado en el login para que el botón nunca se quede "colgado".
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}
