export default function Loading() {
  return (
    <div className="blog-wrap" aria-busy="true" aria-label="Loading articles">
      <div className="sk sk-line sk-title" style={{ maxWidth: "22rem" }} />
      <div className="blog-skeleton-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="sk-card">
            <div className="sk sk-thumb" />
            <div className="sk sk-line" />
            <div className="sk sk-line short" />
          </div>
        ))}
      </div>
    </div>
  );
}
