// Fetches CEDEAR prices and CCL data from data912.com
// Combines arg_cedears (ARS prices) with ccl (implicit CCL per ticker)
const https = require('https');

const CEDEARS_URL = 'https://data912.com/live/arg_cedears';
const CCL_URL = 'https://data912.com/live/ccl';

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  try {
    const [cedears, ccl] = await Promise.all([fetchJSON(CEDEARS_URL), fetchJSON(CCL_URL)]);

    // Build CEDEAR price lookup by symbol
    const cedearPrices = {};
    for (const c of cedears) {
      if (c.c > 0) {
        cedearPrices[c.symbol] = {
          price: c.c,
          bid: c.px_bid || 0,
          ask: c.px_ask || 0,
          volume: c.v || 0,
          pct_change: c.pct_change || 0,
        };
      }
    }

    // Process CCL data — join with CEDEAR prices
    // Filter to cedear/adr panels only (skip pure stocks like YPFD)
    const result = [];
    for (const item of ccl) {
      const sym = item.ticker_usa;
      const symAr = item.ticker_ar;
      const cclMark = parseFloat(item.CCL_mark) || 0;
      const cclBid = parseFloat(item.CCL_bid) || 0;
      const cclAsk = parseFloat(item.CCL_ask) || 0;
      const arsVol = parseFloat(item.ars_volume) || 0;

      if (cclMark <= 0) continue;

      // Look up CEDEAR price — try AR ticker first, then US ticker
      const cedear = cedearPrices[symAr] || cedearPrices[sym];
      if (!cedear) continue;

      result.push({
        symbol: sym,
        ticker_ar: symAr,
        cedear_price: cedear.price,
        ccl_implicit: cclMark,
        ccl_bid: cclBid,
        ccl_ask: cclAsk,
        volume: cedear.volume,
        ars_volume: arsVol,
        pct_change: cedear.pct_change,
        arg_panel: item.arg_panel,
        usa_panel: item.usa_panel,
      });
    }

    // CCL reference = median of top-10 by ars_volume (most liquid)
    const sorted = [...result].sort((a, b) => b.ars_volume - a.ars_volume);
    const top10 = sorted.slice(0, 10).map(x => x.ccl_implicit).sort((a, b) => a - b);
    const mid = Math.floor(top10.length / 2);
    const cclReference = top10.length % 2 === 0
      ? (top10[mid - 1] + top10[mid]) / 2
      : top10[mid];

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ data: result, ccl_reference: cclReference, source: 'data912' }),
    };
  } catch (e) {
    console.error('data912 CEDEAR fetch error:', e);
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Failed to fetch CEDEAR data' }) };
  }
};

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON from ' + url)); }
      });
    }).on('error', reject);
  });
}
