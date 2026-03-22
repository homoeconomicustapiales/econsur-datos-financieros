const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const CONFIG_PATH = path.join(__dirname, 'public', 'config.json');

app.disable('x-powered-by');
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "img-src 'self' data: https:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
      "connect-src 'self' https://api.argentinadatos.com",
      "object-src 'none'",
    ].join('; ')
  );
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

// --- Config API ---

function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

// Public read
app.get('/api/config', (req, res) => {
  res.json(readConfig());
});

// --- FCI Data (via ArgentinaDatos) ---

app.get('/api/fci', async (req, res) => {
  try {
    const [mmLatest, mmPrevious, rmLatest, rmPrevious] = await Promise.all([
      fetch('https://api.argentinadatos.com/v1/finanzas/fci/mercadoDinero/ultimo').then(r => r.json()),
      fetch('https://api.argentinadatos.com/v1/finanzas/fci/mercadoDinero/penultimo').then(r => r.json()),
      fetch('https://api.argentinadatos.com/v1/finanzas/fci/rentaMixta/ultimo').then(r => r.json()),
      fetch('https://api.argentinadatos.com/v1/finanzas/fci/rentaMixta/penultimo').then(r => r.json()),
    ]);
    const filterValid = d => d.filter(x => x.fecha && x.vcp);
    const allLatest = [...filterValid(mmLatest), ...filterValid(rmLatest)];
    const allPrevious = [...filterValid(mmPrevious), ...filterValid(rmPrevious)];
    const prevMap = {};
    for (const f of allPrevious) prevMap[f.fondo] = f;
    const results = [];
    for (const fund of allLatest) {
      const prev = prevMap[fund.fondo];
      if (!prev || !prev.vcp || !fund.vcp) continue;
      const days = Math.abs(Math.round((new Date(fund.fecha) - new Date(prev.fecha)) / 86400000));
      if (days <= 0) continue;
      const tna = Math.round(((fund.vcp - prev.vcp) / prev.vcp / days) * 365 * 100 * 100) / 100;
      results.push({ nombre: fund.fondo, tna, patrimonio: fund.patrimonio, fechaDesde: prev.fecha, fechaHasta: fund.fecha });
    }
    res.json({ data: results });
  } catch (err) {
    console.error('FCI proxy error:', err.message);
    res.status(502).json({ error: 'Failed to fetch FCI data' });
  }
});

// --- CAFCI Ficha Proxy (for comparar.html) ---

app.get('/api/cafci/ficha/:fondoId/:claseId', async (req, res) => {
  const { fondoId, claseId } = req.params;
  const url = `https://api.cafci.org.ar/estadisticas/informacion/diaria/ficha/${encodeURIComponent(fondoId)}/${encodeURIComponent(claseId)}`;
  try {
    const resp = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Referer': 'https://www.cafci.org.ar/',
        'Origin': 'https://www.cafci.org.ar',
      }
    });
    if (!resp.ok) throw new Error(`CAFCI API returned ${resp.status}`);
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    console.error('CAFCI ficha proxy error:', err.message);
    res.status(502).json({ error: 'Failed to fetch CAFCI ficha data' });
  }
});

// --- LECAP/BONCAP Prices (BYMA proxy) ---

app.get('/api/lecaps', async (req, res) => {
  const https = require('https');
  try {
    const data = await new Promise((resolve, reject) => {
      const body = '{}';
      const options = {
        hostname: 'open.bymadata.com.ar',
        path: '/vanoms-be-core/rest/api/bymadata/free/lebacs',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        rejectUnauthorized: false,
      };
      const r = https.request(options, (resp) => {
        let d = '';
        resp.on('data', chunk => d += chunk);
        resp.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
      });
      r.on('error', reject);
      r.write(body);
      r.end();
    });

    const result = [];
    for (const item of (data.data || [])) {
      if (item.settlementType !== '2') continue;
      const trade = parseFloat(item.trade) || 0;
      const close = parseFloat(item.closingPrice) || 0;
      const price = trade > 0 ? trade : close;
      if (price <= 0) continue;
      result.push({ symbol: item.symbol, price, offer, bid: parseFloat(item.bidPrice) || 0, close, trade: parseFloat(item.trade) || 0, maturityDate: item.maturityDate, daysToMaturity: item.daysToMaturity });
    }
    res.json({ data: result });
  } catch (err) {
    console.error('BYMA proxy error:', err.message);
    res.status(502).json({ error: 'Failed to fetch BYMA data' });
  }
});

// --- CEDEAR Arbitrage (data912 proxy) ---

app.get('/api/cedears', async (req, res) => {
  try {
    const [cedears, ccl] = await Promise.all([
      fetch('https://data912.com/live/arg_cedears').then(r => r.json()),
      fetch('https://data912.com/live/ccl').then(r => r.json()),
    ]);
    const cedearPrices = {};
    for (const c of cedears) {
      if (c.c > 0) cedearPrices[c.symbol] = { price: c.c, bid: c.px_bid || 0, ask: c.px_ask || 0, volume: c.v || 0, pct_change: c.pct_change || 0 };
    }
    const result = [];
    for (const item of ccl) {
      const sym = item.ticker_usa;
      const symAr = item.ticker_ar;
      const cclMark = parseFloat(item.CCL_mark) || 0;
      if (cclMark <= 0) continue;
      const cedear = cedearPrices[symAr] || cedearPrices[sym];
      if (!cedear) continue;
      result.push({ symbol: sym, ticker_ar: symAr, cedear_price: cedear.price, ccl_implicit: cclMark, ccl_bid: parseFloat(item.CCL_bid) || 0, ccl_ask: parseFloat(item.CCL_ask) || 0, volume: cedear.volume, ars_volume: parseFloat(item.ars_volume) || 0, pct_change: cedear.pct_change, arg_panel: item.arg_panel, usa_panel: item.usa_panel });
    }
    const sorted = [...result].sort((a, b) => b.ars_volume - a.ars_volume);
    const top10 = sorted.slice(0, 10).map(x => x.ccl_implicit).sort((a, b) => a - b);
    const mid = Math.floor(top10.length / 2);
    const cclRef = top10.length % 2 === 0 ? (top10[mid - 1] + top10[mid]) / 2 : top10[mid];
    res.json({ data: result, ccl_reference: cclRef, source: 'data912' });
  } catch (err) {
    console.error('CEDEAR proxy error:', err.message);
    res.status(502).json({ error: 'Failed to fetch CEDEAR data' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
