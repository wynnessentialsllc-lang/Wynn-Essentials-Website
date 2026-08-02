export default function Loading() {
  return (
    <div className="blog-wrap" aria-busy="true" aria-label="Loading article">
      <div className="sk sk-line sk-eyebrow" style={{ maxWidth: "9rem" }} />
      <div className="sk sk-line sk-title" style={{ maxWidth: "34rem" }} />
      <div className="sk sk-thumb" style={{ margin: "24px 0" }} />
      <div className="sk sk-line" />
      <div className="sk sk-line" />
      <div className="sk sk-line short" />
    </div>
  );
}
