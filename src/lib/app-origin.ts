import "server-only";

import { headers } from "next/headers";

import { env } from "@/lib/env";
import { resolveAppOrigin } from "@/lib/origin";

/** The origin for absolute links built during this request (see resolveAppOrigin). */
export async function getAppOrigin(): Promise<string> {
  const headersList = await headers();
  return resolveAppOrigin({
    host: headersList.get("host"),
    forwardedProto: headersList.get("x-forwarded-proto"),
    siteUrl: env.NEXT_PUBLIC_SITE_URL,
    vercelUrl: process.env.VERCEL_URL,
    vercelBranchUrl: process.env.VERCEL_BRANCH_URL,
    isDev: process.env.NODE_ENV === "development",
  });
}
