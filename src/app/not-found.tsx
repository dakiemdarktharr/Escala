import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page-error">
      <span className="brand-mark" aria-hidden="true">
        e
      </span>
      <h1>Không tìm thấy trang này.</h1>
      <p>Quay lại hộp thư để tiếp tục xử lý hội thoại.</p>
      <Link className="button primary" href="/">
        Mở hộp thư
      </Link>
    </main>
  );
}
