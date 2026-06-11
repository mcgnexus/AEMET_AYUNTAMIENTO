const url = process.env.WEATHER_CAPTURE_URL;
const secret = process.env.WEATHER_CAPTURE_SECRET;

if (!url || !secret) {
  console.error("WEATHER_CAPTURE_URL y WEATHER_CAPTURE_SECRET son obligatorios");
  process.exit(2);
}

const response = await fetch(url, {
  headers: {
    authorization: `Bearer ${secret}`,
  },
  signal: AbortSignal.timeout(120_000),
});

const body = await response.text();
if (!response.ok) {
  console.error(`Captura meteorológica fallida (${response.status}): ${body}`);
  process.exit(1);
}

const result = JSON.parse(body);
console.log(JSON.stringify({
  ok: result.ok,
  consensusTime: result.consensusTime,
  confidencePct: result.confidencePct,
  sources: result.sources,
}));
