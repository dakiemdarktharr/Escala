"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="page-error" role="alert">
      <span className="brand-mark" aria-hidden="true">
        e
      </span>
      <h1>Chưa tải được không gian làm việc.</h1>
      <p>
        Thử mở lại không gian làm việc. Dữ liệu bản xem thử có thể mất khi tải lại.
      </p>
      <button className="button primary" onClick={reset}>
        Thử lại
      </button>
    </main>
  );
}
