# Rendimientos AR

Sitio para comparar rendimientos de productos financieros en Argentina:

- Billeteras y cuentas remuneradas
- Fondos comunes de inversion de liquidez
- Plazos fijos
- LECAPs y BONCAPs

Live en [rendimientos.co](https://rendimientos.co)

## Fuentes de datos

| Seccion | Fuente | Actualizacion |
|---------|--------|---------------|
| Billeteras | Manual en `config.json` | Manual |
| FCIs | [ArgentinaDatos API](https://api.argentinadatos.com) via CAFCI | En vivo |
| Plazo Fijo | [ArgentinaDatos API](https://api.argentinadatos.com/v1/finanzas/tasas/plazoFijo) | En vivo |
| LECAPs | [data912.com](https://data912.com/live/arg_notes) via Netlify function | En vivo |
| BONCAPs | [data912.com](https://data912.com/live/arg_bonds) via Netlify function | En vivo |

## Estructura

```
public/              Frontend estatico
  index.html         Pagina principal (3 tabs: Billeteras, Plazo Fijo, LECAPs)
  app.js             Logica del frontend
  config.json        Datos de billeteras y FCIs + config LECAPs (pago final, vencimiento)
  styles.css         Estilos + dark mode
  comparar.html      Comparador de fondos
server.js            Servidor local Express (dev)
netlify/functions/
  cafci.js           Proxy ArgentinaDatos para FCIs
  lecaps.js          Proxy data912 para precios de LECAPs y BONCAPs en vivo
netlify.toml         Config de deploy y redirects
```

## Como levantar localmente

```bash
npm install
npm start
# http://localhost:3000
```

## Endpoints

| Ruta | Descripcion |
|------|-------------|
| `GET /api/config` | Config con billeteras, FCIs y LECAPs |
| `GET /api/fci` | FCIs con TNA calculada (proxy ArgentinaDatos) |
| `GET /api/lecaps` | Precios LECAP/BONCAP en vivo (proxy data912) |
| `GET /api/cafci/ficha/:fondoId/:claseId` | Ficha tecnica de fondo (proxy CAFCI) |

## LECAPs y BONCAPs: como funciona

1. El frontend llama a `/api/lecaps` que consulta data912.com en vivo
2. data912 devuelve precios de mercado — se usa el ultimo operado (`c`)
3. LECAPs desde `/live/arg_notes`, BONCAPs desde `/live/arg_bonds`
4. Se calcula TIR y TNA desde la fecha de liquidacion (T+1 dia habil, saltando feriados AR)
5. El pago final y fecha de vencimiento de cada letra estan en `config.json`

## Deploy

Deploy directo a Netlify:

```bash
npx netlify deploy --prod --dir=public
```

## Seguridad del server local

- `Content-Security-Policy`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
