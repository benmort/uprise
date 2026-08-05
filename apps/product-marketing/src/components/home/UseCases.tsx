"use client";

import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, ZoomIn } from "lucide-react";
import RevealScope from "./RevealScope";
import { SectionHead, cssVars } from "./parts";
import { SECTION } from "./content";
import { USE_CASES } from "./sections";

const FOCUS_POINTS = [
  ["16.667%", "25%"],
  ["50%", "25%"],
  ["83.333%", "25%"],
  ["16.667%", "75%"],
  ["50%", "75%"],
  ["83.333%", "75%"],
] as const;

/**
 * Who it's for: one shared campaign world on desktop, then the original viewpoints on demand.
 *
 * The panorama is only the establishing shot. Selecting one of its six regions zooms the shared
 * scene towards that focal point, then resolves to the corresponding original illustration. The
 * source cards remain the narrow-screen fallback, in the same order, so the interaction does not
 * make content or meaning dependent on motion.
 */
export default function UseCases() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isDetail, setIsDetail] = useState(false);
  const triggerRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const closeRef = useRef<HTMLButtonElement>(null);
  const activeCard = USE_CASES.cards[activeIndex];
  const [focusX, focusY] = FOCUS_POINTS[activeIndex];

  const openDetail = (index: number) => {
    setActiveIndex(index);
    setIsDetail(true);
  };

  const closeDetail = () => {
    setIsDetail(false);
    window.requestAnimationFrame(() => triggerRefs.current[activeIndex]?.focus());
  };

  useEffect(() => {
    if (!isDetail) return;

    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDetail();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % USE_CASES.cards.length);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setActiveIndex((index) => (index - 1 + USE_CASES.cards.length) % USE_CASES.cards.length);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isDetail]);

  return (
    <RevealScope id={SECTION.campaigns} className="home-types">
      <div className="home-shell">
        <SectionHead eyebrow={USE_CASES.eyebrow} title={USE_CASES.title} />

        <div className="home-upanorama-reveal home-rise">
          <div
            className={`home-upanorama${isDetail ? " is-detail" : ""}`}
            style={cssVars({
              "--panorama": `url(${USE_CASES.panorama})`,
              "--focus-x": focusX,
              "--focus-y": focusY,
            })}
          >
            <div aria-hidden className="home-upanorama-scene" />

            <div
              aria-hidden={isDetail}
              aria-label="Campaign viewpoints"
              className="home-upanorama-grid"
              role="group"
            >
              {USE_CASES.cards.map((card, index) => (
                <button
                  aria-expanded={isDetail && activeIndex === index}
                  className="home-upanorama-hotspot"
                  key={card.title}
                  onClick={() => openDetail(index)}
                  ref={(node) => {
                    triggerRefs.current[index] = node;
                  }}
                  tabIndex={isDetail ? -1 : 0}
                  type="button"
                >
                  <span className="home-upanorama-copy">
                    <span className="home-upanorama-title">{card.title}</span>
                    <span className="home-upanorama-body">{card.body}</span>
                    <span className="home-upanorama-action">
                      <ZoomIn aria-hidden size={15} strokeWidth={2} />
                      Zoom into scene
                    </span>
                  </span>
                </button>
              ))}
            </div>

            <article aria-hidden={!isDetail} aria-live="polite" className="home-udetail">
              <div
                aria-hidden
                className="home-udetail-image"
                key={activeCard.image}
                style={cssVars({ "--detail-img": `url(${activeCard.image})` })}
              />

              <button className="home-udetail-back" onClick={closeDetail} ref={closeRef} type="button">
                <ArrowLeft aria-hidden size={17} strokeWidth={2} />
                All campaigns
              </button>

              <nav aria-label="Choose another campaign viewpoint" className="home-udetail-nav">
                {USE_CASES.cards.map((card, index) => (
                  <button
                    aria-label={`View ${card.title}`}
                    aria-pressed={activeIndex === index}
                    className={activeIndex === index ? "is-active" : ""}
                    key={card.title}
                    onClick={() => setActiveIndex(index)}
                    type="button"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </button>
                ))}
              </nav>

              <div className="home-udetail-copy">
                <span className="home-mono">
                  Viewpoint {String(activeIndex + 1).padStart(2, "0")} / 06
                </span>
                <h3>{activeCard.title}</h3>
                <p>{activeCard.body}</p>
              </div>
            </article>
          </div>
        </div>

        <div className="home-ucards home-ucards--stacked">
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
