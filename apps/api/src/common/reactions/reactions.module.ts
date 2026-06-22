import { Module } from "@nestjs/common";
import { LoggingModule } from "../logging/logging.module";
import { ReactionRegistry } from "./reaction-registry";
import { REACTIONS, type ReactionList } from "./reactions.tokens";

/**
 * Wires the reaction registry. The REACTIONS array starts empty; each domain
 * adds its reactions here as it is ported (docs 06–11). PrismaService is global.
 */
@Module({
  imports: [LoggingModule],
  providers: [
    { provide: REACTIONS, useValue: [] as ReactionList },
    ReactionRegistry,
  ],
  exports: [ReactionRegistry],
})
export class ReactionsModule {}
