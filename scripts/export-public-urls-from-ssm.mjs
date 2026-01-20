import { SSMClient, GetParametersCommand } from "@aws-sdk/client-ssm";

function requireEnv(name) {
  const v = process.env[name];
  if (!v || String(v).trim() === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return String(v).trim();
}

function toEnvLine(name, value) {
  // URL-safe; still quote to avoid shell parsing surprises.
  const escaped = String(value).replace(/"/g, '\\"');
  return `${name}="${escaped}"`;
}

const stage = process.env.STAGE ? String(process.env.STAGE).trim() : "dev";
const prefix = `/PhotoHub/${stage}`;

const mapping = [
  { ssmKey: "PublicApiUrl", envKey: "NEXT_PUBLIC_API_URL" },
  { ssmKey: "PublicDashboardUrl", envKey: "NEXT_PUBLIC_DASHBOARD_URL" },
  { ssmKey: "PublicGalleryUrl", envKey: "NEXT_PUBLIC_GALLERY_URL" },
  { ssmKey: "PublicLandingUrl", envKey: "NEXT_PUBLIC_LANDING_URL" },
];

const names = mapping.map((m) => `${prefix}/${m.ssmKey}`);
const ssm = new SSMClient({});
const res = await ssm.send(
  new GetParametersCommand({
    Names: names,
    WithDecryption: true,
  })
);

const byName = new Map();
for (const p of res.Parameters ?? []) {
  if (p?.Name && typeof p.Value === "string") {
    byName.set(p.Name, p.Value);
  }
}

const missing = [];
for (const n of names) {
  const v = byName.get(n);
  if (!v || String(v).trim() === "") {
    missing.push(n);
  }
}

if (missing.length) {
  throw new Error(
    `Missing required SSM parameters for stage "${stage}":\n` + missing.map((m) => `- ${m}`).join("\n")
  );
}

// Print as KEY="value" lines for easy `eval`/CI export.
for (const m of mapping) {
  const v = byName.get(`${prefix}/${m.ssmKey}`);
  process.stdout.write(toEnvLine(m.envKey, v) + "\n");
}

