/** ============================================================================
 * demo.ts — Minimal health/demo endpoint
 * =============================================================================
 * CONTRACT
 *  - Returns a typed payload conforming to @shared/api:DemoResponse.
 * USES
 *  - Sanity check for server boot, proxy wiring, and CORS in local/dev.
 * ============================================================================ */
import { RequestHandler } from "express";
import { DemoResponse } from "@shared/api";

export const handleDemo: RequestHandler = (req, res) => {
  const response: DemoResponse = {
    message: "Hello from Express server",
  };
  res.status(200).json(response);
};
