import React from "react";
import RevealScope from "./RevealScope";
import { SectionHead, cssVars } from "./parts";
import { SECTION } from "./content";
import { USE_CASES } from "./sections";

/**
 * Who it's for: the heading, then a card per kind of campaign.
 *
 * The <Showreel /> used to sit between the two, cross-fading the real surfaces before the cards
 * named the audiences — capability first, audience second. It now lives on /about-us, where a tour
 * of the product answers "who are you" rather than competing with the homepage's own stage. This
 * section keeps its head and its cards; the reel is route-agnostic, so it moved without changes.
 */
export default function UseCases() {
  return (
    <RevealScope id={SECTION.campaigns} className="home-types">
      <div className="home-shell">
        <SectionHead eyebrow={USE_CASES.eyebrow} title={USE_CASES.title} />

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
      </div>
    </RevealScope>
  );
}
