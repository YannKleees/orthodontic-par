/** ==================================================================
 * cn — Class name merging utility with Tailwind awareness
 * ===================================================================
 * PURPOSE:
 * - Merges multiple class names into a single string.
 * - Resolves Tailwind CSS class conflicts intelligently.
 *
 * SCIENTIFIC CONTEXT:
 * - Uses `clsx` for conditional joining of class strings/objects.
 * - Uses `tailwind-merge` to ensure that only the last conflicting
 *   Tailwind utility for a given CSS property is preserved.
 *
 * @param inputs Spread of class name strings, objects, or arrays.
 * @returns Merged class name string.
 * ===================================================================
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
