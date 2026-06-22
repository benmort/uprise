import type { Reaction } from "@yarns/events";

/** DI token for the array of registered reactions. Domains add their reactions
 *  to this provider as they are ported (docs 06–11). */
export const REACTIONS = Symbol("REACTIONS");

export type ReactionList = Reaction[];
