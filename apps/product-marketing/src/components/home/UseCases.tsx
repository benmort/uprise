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
    <RevealScope id={SECTION.campaigns} className="home-types">
      <div className="home-shell">
        <SectionHead eyebrow={USE_CASES.eyebrow} title={USE_CASES.title} />

        <div className="home-reel home-rise">
          <Showreel />
        </div>

        <div className="home-ucards">
          {USE_CASES.cards.map((c, i) => (
            <article
              className="home-ucard home-rise"
              key={c.title}
              style={cssVars({ "--d": `${(i % 3) * 70}ms`, "--img": `url(${c.image})` })}
            >
              <h3 className="home-h3">{c.title}</h3>
              <p>{c.body}</p>
            </article>
          ))}
        </div>

        {/* Licence attribution for the one image that requires it — see USE_CASES.credit. */}
        <p className="home-ucredit">
          {USE_CASES.credit.lead}{" "}
          <a href={USE_CASES.credit.holderUrl} target="_blank" rel="noreferrer noopener">
            {USE_CASES.credit.holder}
          </a>
          ,{" "}
          <a href={USE_CASES.credit.licenceUrl} target="_blank" rel="noreferrer noopener">
            {USE_CASES.credit.licence}
          </a>
        </p>
      </div>
    </RevealScope>
  );
}
