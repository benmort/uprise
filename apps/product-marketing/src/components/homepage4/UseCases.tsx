import React from "react";
import Showreel from "@/components/marketing/Showreel";
import RevealScope from "./RevealScope";
import { SectionHead, cssVars } from "./parts";
import { SECTION } from "./content";
import { USE_CASES } from "./sections";

/**
 * Who it's for, over the showreel. The order is the argument: the reel cross-fades the real
 * surfaces, then the cards say which kind of campaign each one is for — capability first, audience
 * second.
 *
 * <Showreel /> is route-agnostic (it brings its own browser frame, tab rail and play/pause) and is
 * shared with /homepage3, so it isn't reimplemented here.
 */
export default function UseCases() {
  return (
    <RevealScope id={SECTION.campaigns} className="hp4-types">
      <div className="hp4-shell">
        <SectionHead eyebrow={USE_CASES.eyebrow} title={USE_CASES.title} />

        <div className="hp4-reel hp4-rise">
          <Showreel />
        </div>

        <div className="hp4-ucards">
          {USE_CASES.cards.map((c, i) => (
            <article className="hp4-ucard hp4-rise" key={c.title} style={cssVars({ "--d": `${(i % 3) * 70}ms` })}>
              <h3 className="hp4-h3">{c.title}</h3>
              <p>{c.body}</p>
            </article>
          ))}
        </div>
      </div>
    </RevealScope>
  );
}
