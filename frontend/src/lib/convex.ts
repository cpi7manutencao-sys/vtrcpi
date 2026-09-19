// Convex client - Sistema de Viaturas CPI-7

import { ConvexReactClient } from "convex/react";

// URL do Convex (vem do env ou hardcoded pro deploy)
const CONVEX_URL = import.meta.env.VITE_CONVEX_URL || "http://localhost:3211";

export const convex = new ConvexReactClient(CONVEX_URL, {
  unsavedChangesWarning: false,
});
