import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Expense Tracker",
    short_name: "Expense",
    description: "Mobile-first expense tracking with imports, balances, and investment visibility.",
    start_url: "/today",
    display: "standalone",
    background_color: "#FCFAF7",
    theme_color: "#557A68",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
      {
        src: "/mask-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}

