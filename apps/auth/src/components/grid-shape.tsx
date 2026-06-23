import Image from "next/image";

/** Decorative grid pattern for the auth brand panel (top-right + rotated bottom-left). */
export function GridShape() {
  return (
    <>
      <div className="pointer-events-none absolute right-0 top-0 w-full max-w-[250px] xl:max-w-[450px]">
        <Image width={540} height={254} src="/grid-01.svg" alt="" className="h-auto w-full" />
      </div>
      <div className="pointer-events-none absolute bottom-0 left-0 w-full max-w-[250px] rotate-180 xl:max-w-[450px]">
        <Image width={540} height={254} src="/grid-01.svg" alt="" className="h-auto w-full" />
      </div>
    </>
  );
}
