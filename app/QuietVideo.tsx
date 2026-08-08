"use client";

import { MouseEvent, useEffect, useRef, useState } from "react";

type Props = {
  src: string;
  poster?: string;
  /** Applied to the wrapper, which takes the place the <video> used to hold in the layout. */
  className?: string;
  ariaLabel?: string;
  loop?: boolean;
  preload?: "auto" | "metadata" | "none";
  /** Muted clips that start when they scroll into view (campaign/product film). */
  autoPlay?: boolean;
  /** Extends the trigger area so an auto-playing clip buffers before it's on screen. */
  rootMargin?: string;
};

// Site video without the browser's native control bar, which sat permanently
// over the picture and pulled attention away from the clip. In its place: one
// small play/pause button in the corner that fades in on hover or keyboard
// focus, stays visible while the clip is paused, and is always (faintly) there
// on touch devices, which have no hover. Auto-playing clips still need a
// visible pause mechanism for motion that starts on its own (WCAG 2.2.2) —
// this is that mechanism, just quieter.
export default function QuietVideo({ src, poster, className, ariaLabel, loop = false, preload = "metadata", autoPlay = false, rootMargin = "0px" }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  // A clip the visitor paused on purpose stays paused, even after it scrolls
  // out of view and back in.
  const pausedByUser = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!autoPlay) return;
    const el = ref.current;
    if (!el) return;
    // Respect prefers-reduced-motion: don't auto-play moving video for these
    // visitors. The play button lets them start it themselves.
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) { el.play().catch(() => {}); return; }
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) el.pause();
        else if (!pausedByUser.current) el.play().catch(() => {});
      }
    }, { threshold: 0, rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [autoPlay, rootMargin]);

  // stopPropagation so the control never triggers a clickable card wrapping the clip.
  function toggle(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    const el = ref.current;
    if (!el) return;
    if (el.paused) { pausedByUser.current = false; el.play().catch(() => {}); }
    else { pausedByUser.current = true; el.pause(); }
  }

  const classes = ["quiet-video"];
  if (!autoPlay) classes.push("quiet-video--manual");
  if (playing) classes.push("is-playing");
  if (started) classes.push("is-started");
  if (className) classes.push(className);

  return (
    <span className={classes.join(" ")}>
      <video
        ref={ref}
        src={src}
        poster={poster}
        muted={autoPlay}
        loop={loop}
        playsInline
        preload={preload}
        disablePictureInPicture
        aria-label={ariaLabel}
        onPlay={() => { setPlaying(true); setStarted(true); }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <button type="button" className="quiet-video-toggle" onClick={toggle} aria-label={playing ? "Pause video" : "Play video"}>
        <span aria-hidden="true">{playing ? "❚❚" : "▶"}</span>
      </button>
    </span>
  );
}
