const baseUrl = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

const routes = [
  "/",
  "/login",
  "/app",
  "/app/checks",
  "/app/leads",
  "/app/reports",
  "/app/settings",
  "/app/stores",
  "/app/stores/new",
];

const timeoutMs = 10_000;

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

let failed = false;

for (const route of routes) {
  const url = new URL(route, baseUrl).toString();
  try {
    const response = await fetchWithTimeout(url);
    const ok =
      response.status >= 200 && response.status < 400;
    console.log(`${ok ? "OK" : "FAIL"} ${response.status} ${route}`);
    if (!ok) failed = true;
  } catch (error) {
    failed = true;
    console.log(`FAIL ${route} ${error.message}`);
  }
}

if (failed) process.exit(1);
