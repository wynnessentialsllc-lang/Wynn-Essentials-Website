export default function Loading() {
  return (
    <div className="pdp" aria-busy="true" aria-label="Loading product">
      <div className="pdp-skeleton">
        <div className="sk sk-gallery" />
        <div className="sk-info">
          <div className="sk sk-line sk-eyebrow" />
          <div className="sk sk-line sk-title" />
          <div className="sk sk-line sk-price" />
          <div className="sk sk-line" />
          <div className="sk sk-line" />
          <div className="sk sk-line short" />
          <div className="sk sk-cta" />
        </div>
      </div>
    </div>
  );
}
