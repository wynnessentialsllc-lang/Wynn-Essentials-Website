"use client";

import { useEffect, useState } from "react";
import { relativeDate, reviewsFor, sortReviews, summarize, type Review } from "../../reviews";
import QuietVideo from "../../QuietVideo";

function Stars({ value }: { value: number }) {
  const full = Math.round(value);
  return <span aria-hidden="true">{"★".repeat(full)}{"☆".repeat(5 - full)}</span>;
}

// The product page's "Customer Reviews" block. Like the storefront modal, it
// merges the statically seeded reviews (which also carry any customer video)
// with the approved reviews fetched from /api/reviews, so a review submitted
// through the on-site form — e.g. Shawn's Bohemian Curl review — shows here too,
// alongside the customer video gallery. Gallery-only entries feed the video
// gallery but are not rendered as cards or counted in the rating.
export default function ProductPageReviews({ slug }: { slug: string }) {
  const [submitted, setSubmitted] = useState<Review[]>([]);

  useEffect(() => {
    let active = true;
    fetch("/api/reviews")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d && Array.isArray(d.reviews)) {
          setSubmitted((d.reviews as Review[]).filter((r) => r.productSlug === slug));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [slug]);

  const list = sortReviews([...submitted, ...reviewsFor(slug)]);
  const cards = list.filter((r) => !r.galleryOnly);
  const media = list.filter((r) => r.video || r.image);
  const summary = summarize(cards);

  if (!cards.length && !media.length) return null;

  return (
    <section className="pdp-reviews" aria-label="Customer reviews">
      <h2>Customer Reviews</h2>
      {summary.count > 0 && (
        <p className="pdp-reviews-summary">{summary.average.toFixed(1)} out of 5 · {summary.count} review{summary.count === 1 ? "" : "s"}</p>
      )}
      {media.length > 0 && (
        <div className="review-media">
          {media.map((r) => (
            <figure className="review-media-item" key={`${r.id}-media`}>
              {r.video ? <QuietVideo src={r.video} poster={r.videoPoster} ariaLabel={`Customer video from ${r.author}`} /> : <img src={r.image} alt={`Customer photo from ${r.author}`} loading="lazy" />}
              <figcaption>{r.author}{r.location ? ` · ${r.location}` : ""}</figcaption>
            </figure>
          ))}
        </div>
      )}
      {cards.length > 0 && (
        <ul>
          {cards.map((r) => (
            <li key={r.id}>
              <p className="pdp-review-head"><Stars value={r.rating} /> <b>{r.author}</b>{r.verified && <span className="pdp-verified">Verified buyer</span>}{r.date && <span className="pdp-review-date">{relativeDate(r.date)}</span>}</p>
              {r.title && <p className="pdp-review-title">{r.title}</p>}
              {r.body && <p>{r.body}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
