import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges Tailwind CSS class names safely with conditional support.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
