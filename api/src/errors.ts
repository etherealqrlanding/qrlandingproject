// Error de validación con status HTTP propio — se lanza dentro de transacciones abiertas
// (refund, reschedule, etc.) para que el catch central de cada ruta sea el único lugar
// que hace ROLLBACK, en vez de repetirlo en cada early-return y arriesgarse a dejar una
// transacción colgada en alguna rama.
export class RouteValidationError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'RouteValidationError';
    this.status = status;
  }
}
