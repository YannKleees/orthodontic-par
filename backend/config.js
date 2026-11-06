/**
 * @file config.js
 * @description
 *   Centralized configuration for the orthodontic backend system.
 *   Defines the root directory for all persistent clinical and research data.
 *
 *   Scientific context:
 *   - Ensures reproducibility and traceability of patient and visit data for clinical research.
 *   - Allows for environment-specific overrides to support secure, scalable deployments.
 */

import path from "path";
import { fileURLToPath } from "url";

// Compute the absolute path to the data directory, supporting environment overrides
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(__dirname, "data");