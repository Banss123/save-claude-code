#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const appUrl = process.env.PROD_APP_URL ?? "https://banss-salesops-vercel.vercel.app";
const supabaseRef = process.env.SUPABASE_PROJECT_REF ?? "xahdgabzmjaxmmkcubkf";
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? `https://${supabaseRef}.supabase.co`;
const password = process.env.BANSS_TEST_PASSWORD ?? "test1234";

const accounts = [
  "douglas030305@gmail.com",
  "sunup6974@gmail.com",
  "ban951112@gmail.com",
];

const routes = [
  { path: "/", expected: 200 },
  { path: "/login", expected: 200 },
  { path: "/app", expected: 307, location: "/login?next=%2Fapp" },
  {
    path: "/app/stores/new",
    expected: 307,
    location: "/login?next=%2Fapp%2Fstores%2Fnew",
  },
];

function getAnonKey() {
  if (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  }

  const output = execFileSync(
    "supabase",
    ["projects", "api-keys", "--project-ref", supabaseRef, "-o", "env"],
    { encoding: "utf8" },
  );
  const match = output.match(/^SUPABASE_ANON_KEY="(.+)"$/m);
  if (!match) {
    throw new Error("Could not read Supabase anon key from Supabase CLI.");
  }
  return match[1];
}

async function checkRoute({ path, expected, location }) {
  const response = await fetch(`${appUrl}${path}`, {
    method: "HEAD",
    redirect: "manual",
  });
  if (response.status !== expected) {
    throw new Error(`${path}: expected ${expected}, got ${response.status}`);
  }
  if (location && response.headers.get("location") !== location) {
    throw new Error(
      `${path}: expected location ${location}, got ${response.headers.get("location")}`,
    );
  }
  console.log(`OK ${response.status} ${path}`);
}

async function checkLogin(email, anonKey) {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  if (response.status !== 200) {
    throw new Error(`${email}: expected auth 200, got ${response.status}`);
  }
  console.log(`OK auth ${email}`);
}

try {
  for (const route of routes) {
    await checkRoute(route);
  }

  const anonKey = getAnonKey();
  for (const email of accounts) {
    await checkLogin(email, anonKey);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

