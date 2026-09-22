import type { NextConfig } from "next";
import { APP_VERSION } from "./lib/version";

/* NEXT_PUBLIC_SW_SURUM: her build'de değişen damga. SwKayit bunu
   /sw.js?v=… olarak kullanır; sw.js önbellek adını bundan türetir.
   Böylece deploy sonrası eski kabuk kendiliğinden geçersiz olur. */
const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_SW_SURUM: `${APP_VERSION}-${Date.now().toString(36)}`,
  },
};

export default nextConfig;
