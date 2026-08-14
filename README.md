# Tango QR

Landing comercial + API para una agencia de turismo que comercializa casas de tango en Buenos Aires.

## Stack

- **Frontend** (`apps/web`): React 18 + Vite + TypeScript + Tailwind + react-i18next
- **Backend** (`api`): Node 20 + Express + TypeScript + Postgres (pg)
- **DB**: PostgreSQL 16 (Docker local en dev, Supabase en producción)
- **Pagos**: Stripe (Fase 3)
- **Email**: Resend (Fase 4)
- **Admin**: panel separado (Fase 5)

## Estructura

```
tangoqr/
├── apps/
│   └── web/         # Landing pública
├── api/             # API + webhooks Stripe
├── docker-compose.yml
└── package.json     # npm workspaces
```

## Setup local

1. Instalar dependencias:
   ```bash
   npm install
   ```

2. Copiar archivos de entorno:
   ```bash
   cp .env.example .env
   cp api/.env.example api/.env
   cp apps/web/.env.example apps/web/.env
   ```

3. Levantar Postgres con Docker:
   ```bash
   npm run db:up
   ```

4. Aplicar migraciones y seed inicial:
   ```bash
   npm run db:migrate
   npm run db:seed
   ```

5. En terminales separadas:
   ```bash
   npm run dev:api   # http://localhost:4000
   npm run dev:web   # http://localhost:5173
   ```

6. Verificar:
   ```bash
   curl http://localhost:4000/health
   curl http://localhost:4000/api/categories
   curl http://localhost:4000/api/products?category=shows-de-tango
   ```

   En el navegador: abrí `http://localhost:5173/?ref=UBER01` y deberías ver:
   - El badge dorado en el hero confirmando el código del vendedor
   - 3 cards de la casa demo en "Casas destacadas"
   - Página de detalle al hacer clic, con carousel + selector de 5 tiers

## Trazabilidad de vendedores

Cada vendedor (Uber, conserje, hotel) recibe un código único. Su QR apunta a:

```
https://tangoqr.net/?ref=COD123
```

Al cargar la landing, el hook `useRefCapture` valida el código y lo guarda en una cookie `et_ref` por 30 días. Al checkout, ese código se envía al backend y se persiste como `order_attribution` para el cálculo de comisiones.

## Roadmap

- [x] **Fase 1** — Fundación (monorepo, scaffolding, ref capture, i18n)
- [x] **Fase 2** — Catálogo público (schema, seeds, listado, página de producto con carousel y selector de tiers)
- [ ] **Fase 3** — Checkout + Stripe + webhook de confirmación
- [ ] **Fase 4** — Emails transaccionales (Resend)
- [ ] **Fase 5** — Panel admin (CRUD productos, vendedores, generador de QR, reporte de comisiones)
- [ ] **Fase 6** — Pulido (SEO, animaciones, performance)
