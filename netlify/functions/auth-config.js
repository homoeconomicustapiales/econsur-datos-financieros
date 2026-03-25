exports.handler = async (event) => {
  const allowedOrigins = [
    'https://rendimientos.co',
    'https://rendimientos-ar.netlify.app',
  ];
  const origin = (event.headers || {}).origin || '';
  const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': corsOrigin,
      'Vary': 'Origin',
      'Cache-Control': 'private, no-store',
    },
    body: JSON.stringify({
      url: process.env.SUPABASE_URL || '',
      anonKey: process.env.SUPABASE_ANON_KEY || '',
    }),
  };
};
