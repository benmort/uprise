import { Global, Module } from "@nestjs/common";
import { TenantSubdomainResolver } from "./tenant-subdomain.resolver";

/**
 * Host → tenant resolution for subdomain routing. `@Global` so the global `BasicAuthGuard`
 * (an AppModule provider) can inject the resolver without a module-import dance.
 */
@Global()
@Module({
  providers: [TenantSubdomainResolver],
  exports: [TenantSubdomainResolver],
})
export class TenantRoutingModule {}
