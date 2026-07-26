import { betterAuth } from "better-auth";
import { pool } from "@/db";

const developmentSecret =
  "login-development-secret-change-before-production-2026";
const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const cookieDomain = process.env.AUTH_COOKIE_DOMAIN?.trim();

export const auth = betterAuth({
  appName: "Tecnosocialismo",
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET ?? developmentSecret,
  baseURL,
  trustedOrigins: process.env.TRUSTED_ORIGINS
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [baseURL],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 30,
  },
  advanced: {
    cookiePrefix: "tecnosocialismo",
    useSecureCookies: baseURL.startsWith("https://"),
    ...(cookieDomain
      ? {
          crossSubDomainCookies: {
            enabled: true,
            domain: cookieDomain,
          },
        }
      : {}),
  },
});
