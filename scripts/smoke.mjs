/* Simple synthetic smoke test. Usage:
   API_URL=https://xxxxx.execute-api.xx.amazonaws.com yarn smoke
*/
import https from 'https';

const api = process.env.API_URL;
if (!api) {
  console.error('Missing API_URL env');
  process.exit(1);
}

const url = new URL('/health', api);
https.get(url, (res) => {
  const chunks = [];
  res.on('data', (d) => chunks.push(d));
  res.on('end', () => {
    const body = Buffer.concat(chunks).toString();
    const ok = res.statusCode === 200;
    console.log(JSON.stringify({ endpoint: url.toString(), status: res.statusCode, body: safeParse(body) }, null, 2));
    process.exit(ok ? 0 : 2);
  });
}).on('error', (e) => {
  console.error(e);
  process.exit(2);
});

function safeParse(s) {
  try { return JSON.parse(s); } catch { return s; }
}

