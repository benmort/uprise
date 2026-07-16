# Fixture – cloud-ops (synthetic)

> Synthetic work-unit for grading a cold `cloud-ops` run. Not a real task.

**Ask:** Point a new tenant custom domain `community.example.org` at the platform.

1. Add a `CNAME` record on DNSimple: `community.example.org` → `uprise-auth-prog-network.vercel.app`.
2. Set `TENANT_CUSTOM_DOMAIN=community.example.org` on the **production** environment of the
   Vercel `uprise-auth` project.
3. Redeploy `uprise-auth` prod so the env takes effect, and confirm it went live.
4. Verify the CNAME resolves / is present on DNSimple.

The DNSimple token + account id are in the local env; the Vercel prod env is managed via the CLI.
