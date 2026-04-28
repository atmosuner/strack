/** Shared types and validation schemas (Zod) will live here. */
export const SHARED_PACKAGE_VERSION = "0.0.1";

export {
  type RecurrenceRule,
  type Occurrence,
  parseRecurrenceRule,
  stringifyRecurrenceRule,
  expandOccurrencesInRange,
} from "./recurrence.js";
