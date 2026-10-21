/**
 * Guards for demo-data seeding endpoints.
 *
 * Demo seeding writes fake projects, parties, bills, payments and users into a
 * tenant. It must only ever be triggered explicitly by a Super Admin, and never
 * in production unless ALLOW_DEMO_SEED=true is set deliberately.
 */

export interface DemoSeedDenial {
  message: string;
  code: string;
  status: number;
}

export function isDemoSeedAllowedInEnvironment(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.ALLOW_DEMO_SEED === "true";
}

/** Returns null when seeding is allowed, otherwise the reason it is refused. */
export function checkDemoSeedAllowed(role: string | undefined | null): DemoSeedDenial | null {
  if (role !== "SUPER_ADMIN") {
    return {
      message: "Forbidden: Super Admin privileges are required to seed demo data",
      code: "FORBIDDEN",
      status: 403,
    };
  }
  if (!isDemoSeedAllowedInEnvironment()) {
    return {
      message:
        "Forbidden: Demo data seeding is disabled in production. Set ALLOW_DEMO_SEED=true to enable it on a demo environment.",
      code: "DEMO_SEED_DISABLED",
      status: 403,
    };
  }
  return null;
}
