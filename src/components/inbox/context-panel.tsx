"use client";

import { useId } from "react";
import type { ThreadDetailResponse } from "@/domain/contracts";
import { Icon } from "@/components/ui/icon";
import { actionLabels, dateLabel, EmptyState, LevelBadge, readable, TriageSignals } from "./presentation";

export type ContextTab = "analysis" | "evidence" | "activity";

export function ContextPanel({
  detail,
  tab,
  onTabChange,
  sample,
  onClose,
}: {
  detail: ThreadDetailResponse;
  tab: ContextTab;
  onTabChange: (tab: ContextTab) => void;
  sample: boolean;
  onClose?: () => void;
}) {
  const id = useId();
  const evidence = detail.recommendation?.evidence ?? detail.evidence;
  const events = [...detail.audit].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
  return (
    <div className="context-panel">
      <div className="context-title">
        <Icon name="book" size={18} />
        <h2>Ngữ cảnh hội thoại</h2>
        {onClose && <button className="icon-button context-close" onClick={onClose} aria-label="Thu gọn ngữ cảnh"><Icon name="close" size={15} /></button>}
      </div>
      <div
        className="context-tabs"
        role="tablist"
        aria-label="Ngữ cảnh hội thoại"
      >
        {(
          [
            ["analysis", "Tổng quan"],
            ["evidence", "Nguồn"],
            ["activity", "Hoạt động"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            id={`${id}-${value}`}
            aria-controls={`${id}-${value}-panel`}
            aria-selected={tab === value}
            tabIndex={tab === value ? 0 : -1}
            onClick={() => onTabChange(value)}
            onKeyDown={(event) => {
              if (
                ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              ) {
                event.preventDefault();
                const tabs: ContextTab[] = ["analysis", "evidence", "activity"];
                const target =
                  event.key === "Home"
                    ? "analysis"
                    : event.key === "End"
                      ? "activity"
                      : tabs[(tabs.indexOf(tab) + (event.key === "ArrowRight" ? 1 : 2)) % 3];
                onTabChange(target);
                document.getElementById(`${id}-${target}`)?.focus();
              }
            }}
          >
            {label}
            {value === "evidence" && <span>{evidence.length}</span>}
          </button>
        ))}
      </div>
      <div
        className="context-scroll"
        role="tabpanel"
        id={`${id}-${tab}-panel`}
        aria-labelledby={`${id}-${tab}`}
        tabIndex={0}
      >
        {tab === "analysis" ? (
          <>
            {detail.thread.conversationState && <section className="context-section"><div className="section-title"><Icon name="shield" size={17} /><h3>{readable(detail.thread.conversationState)}</h3></div>{detail.thread.stateReasons?.[0] && <p className="context-explanation">{readable(detail.thread.stateReasons[0])}</p>}{(detail.thread.stateReasons?.length ?? 0) > 1 && <details className="audit-details"><summary>Chi tiết</summary><ul>{detail.thread.stateReasons?.slice(1).map((reason, index) => <li key={index}>{readable(reason)}</li>)}</ul></details>}</section>}
            <section className="context-section">
              <div className="section-title"><Icon name="spark" size={17} /><h3>Phân tích tin nhắn khách</h3></div>
              <p className="context-explanation">Yêu cầu: {readable(detail.thread.intent)}</p>
              <TriageSignals thread={detail.thread} sample={sample} />
            </section>
            {detail.recommendation && <section className="context-section">
              <div className="section-title"><Icon name="shield" size={17} /><h3>Gợi ý xử lý</h3></div>
              <LevelBadge kind="risk" level={detail.recommendation.risk} />
              <dl className="analysis-facts">
                <div><dt>Bước tiếp theo</dt><dd>{readable(detail.recommendation.recommendedStep || "Kiểm tra yêu cầu của khách")}</dd></div>
                <div><dt>Quyết định theo quy tắc</dt><dd>{detail.recommendation.deliveryState === "AUTO_SEND" ? "Đủ điều kiện tự động (mô phỏng)" : readable(detail.recommendation.deliveryState || "REVIEW_REQUIRED")}</dd></div>
              </dl>
              {detail.recommendation.reasons[0] && <p className="context-explanation">{readable(detail.recommendation.reasons[0])}</p>}
              <details className="audit-details"><summary>Chi tiết</summary>
              <dl className="analysis-facts">
                <div><dt>Độ tin cậy</dt><dd>{detail.recommendation.confidence !== null && Number.isFinite(detail.recommendation.confidence) ? `${Math.round(detail.recommendation.confidence * 100)}%` : "Chưa có"}</dd></div>
                {Number.isFinite(detail.recommendation.confidenceThreshold) && <div><dt>Ngưỡng tự động</dt><dd>{Math.round(detail.recommendation.confidenceThreshold * 100)}%</dd></div>}
                <div><dt>Nguồn bản nháp</dt><dd>{sample ? "Mẫu minh họa" : detail.recommendation.generationProvider === "test_stub" ? "Bản nháp kiểm thử cục bộ" : detail.recommendation.draftSource === "openai" ? "Do OpenAI tạo" : detail.recommendation.draftSource === "template" ? "Mẫu dự phòng đã duyệt" : "Chưa có"}</dd></div>
                <div><dt>Quy tắc</dt><dd>{detail.recommendation.policyVersion}</dd></div>
              </dl>
              <p className="context-footnote">Chế độ xử lý quyết định việc gửi câu trả lời đủ điều kiện. Phê duyệt rủi ro độc lập với độ tin cậy. Chỉ gửi mô phỏng, không thao tác trên sàn hoặc đơn hàng.</p>
              <details className="audit-details"><summary>Lý do quyết định</summary><ul>{detail.recommendation.reasons.map((reason, index) => <li key={index}>{readable(reason)}</li>)}</ul></details>
              {detail.recommendation.draft && <details className="audit-details"><summary>Bản nháp đề xuất ban đầu</summary><p>{detail.recommendation.draft}</p></details>}
              {detail.recommendation.generationProvider === "test_stub" && <p className="context-footnote">Tạo từ dữ liệu kiểm thử cục bộ, không gọi AI trực tiếp.</p>}
              {detail.recommendation.modelStatus === "fallback" && <details className="audit-details"><summary>Tình trạng soạn nháp</summary><p>{readable(detail.recommendation.modelNotice || "Chưa có bản nháp OpenAI trực tiếp. Bạn vẫn có thể tự soạn.")}</p></details>}
              </details>
            </section>}
          </>
        ) : tab === "evidence" ? (
          <>
            <section className="context-section">
              <div className="section-title">
                <Icon name="box" size={17} />
                <h3>Thông tin đơn hàng</h3>
              </div>
              {detail.order ? (
                <div className="order-card">
                  <div className="order-product">
                    <span className="product-placeholder">
                      <Icon name="box" size={25} />
                    </span>
                    <div>
                      <strong>{detail.order.productName}</strong>
                      <span>Số lượng {detail.order.quantity}</span>
                    </div>
                  </div>
                  <dl className="order-facts">
                    <div>
                      <dt>Đơn hàng</dt>
                      <dd>#{detail.order.orderId}</dd>
                    </div>
                    <div>
                      <dt>Trạng thái</dt>
                      <dd>{detail.order.status}</dd>
                    </div>
                    {detail.order.paymentStatus && (
                      <div>
                        <dt>Thanh toán</dt>
                        <dd>{detail.order.paymentStatus}</dd>
                      </div>
                    )}
                    {detail.order.deliveryDeadline && (
                      <div>
                        <dt>Hạn giao</dt>
                        <dd>
                          {dateLabel(detail.order.deliveryDeadline, true)}
                        </dd>
                      </div>
                    )}
                  </dl>
                  <p className="context-footnote">
                    {sample
                      ? "Đơn hàng minh họa cho bản xem thử."
                      : "Thông tin đã lưu; chưa đồng bộ trực tiếp với sàn."}
                  </p>
                </div>
              ) : (
                <p className="context-explanation">
                  Hội thoại chưa gắn với đơn hàng. Hỏi thêm thông tin khi cần.
                </p>
              )}
            </section>
            <section className="context-section">
              <div className="section-title">
                <Icon name="file" size={17} />
                <h3>Nguồn tham chiếu</h3>
              </div>
              <p className="context-explanation">
                Đối chiếu nguồn trước khi gửi mô phỏng câu trả lời.
              </p>
              {evidence.length === 0 ? (
                <div className="evidence-empty">
                  <Icon name="alert" size={20} />
                  <strong>Chưa có nguồn tham chiếu</strong>
                  <p>
                    Chưa có nguồn để xác nhận thông tin. Có thể hỏi khách bổ sung, hoặc tự kiểm tra trước khi trả lời.
                  </p>
                </div>
              ) : (
                evidence.map((entry) => (
                  <details className="evidence-card" key={entry.id} open>
                    <summary>
                      <Icon name="file" size={17} />
                      <span>{entry.title}</span>
                      <Icon name="chevron" size={14} />
                    </summary>
                    <div className="evidence-body">
                      <p>{entry.snippet}</p>
                      <div className="evidence-meta">
                        <span>{readable(entry.source)}</span>
                        <span>v{entry.version}</span>
                      </div>
                      <span className="evidence-id" title={entry.id}>
                        {entry.id}
                      </span>
                    </div>
                  </details>
                ))
              )}
            </section>
            {detail.recommendation && (
              <div className="policy-note">
                <Icon name="shield" size={17} />
                <span>
                  Quy tắc cố định kiểm soát mọi câu trả lời.
                  <details className="audit-details"><summary>Chi tiết</summary><small>Phiên bản {detail.recommendation.policyVersion}</small></details>
                </span>
              </div>
            )}
          </>
        ) : (
          <section className="context-section">
            <div className="section-title">
              <Icon name="history" size={17} />
              <h3>Lịch sử xử lý</h3>
            </div>
            <p className="context-explanation">
              Thao tác Escala, các lần gửi mô phỏng và quyết định của bạn.
            </p>
            {events.length === 0 ? (
              <EmptyState icon="history" title="Chưa có hoạt động">
                Các thao tác được ghi lại tại đây trong quá trình xử lý.
              </EmptyState>
            ) : (
              <ol className="audit-list">
                {events.map((event) => (
                  <li key={event.id}>
                    <span className={`audit-icon ${event.actor}`}>
                      <Icon
                        name={event.actor === "seller" ? "check" : "spark"}
                        size={13}
                      />
                    </span>
                    <div>
                      <strong>
                        {event.action in actionLabels
                          ? actionLabels[
                              event.action as keyof typeof actionLabels
                            ]
                          : readable(event.action)}
                      </strong>
                      <p>
                        {event.reply
                          ? "Đã lưu câu trả lời · gửi mô phỏng"
                          : event.transportState ? `Lần gửi: ${readable(event.transportState)}` : event.actor === "seller"
                          ? "Đã ghi nhận quyết định của người bán"
                          : event.type === "inbound" ? "Đã nhận tin nhắn khách" : event.type === "autonomy" ? "Quyết định tự động theo quy tắc" : "Đã ghi nhận thao tác"}
                      </p>
                      <time dateTime={event.createdAt}>
                        {dateLabel(event.createdAt, true)}
                      </time>
                      {(event.reply?.finalText || event.attemptedText) && <p className="audit-excerpt">“{event.reply?.finalText ?? event.attemptedText}”</p>}

                      {event.reply && (
                        <details className="audit-details">
                          <summary>Chi tiết gửi và chỉnh sửa</summary>
                          <p>Nguồn: {readable(event.reply.source)} · {event.reply.edited ? "Người bán đã sửa" : "Chưa chỉnh sửa"}</p>
                          <p>Rủi ro: {readable(event.reply.risk)} · {readable(event.reply.deliveryState)}</p>
                          <p>Độ tin cậy: {event.reply.confidence === null ? "Chưa có" : `${Math.round(event.reply.confidence * 100)}%`}</p>
                          <p>Phê duyệt nội dung nhạy cảm: {event.reply.sellerApproved ? "Đã ghi nhận rõ ràng" : event.reply.risk !== "high" ? "Không cần" : "Chưa ghi nhận"} · Gửi mô phỏng</p>
                          {event.reply.originalDraft && <p>Bản nháp gốc: {event.reply.originalDraft}</p>}
                          <p>Câu trả lời cuối: {event.reply.finalText}</p>
                          {event.reply.approvedText && <p>Nội dung đã duyệt: {event.reply.approvedText}</p>}
                          {event.reply.providerMessageId && <p>Mã lần gửi: {event.reply.providerMessageId}</p>}
                        </details>
                      )}
                      {event.reasonCodes.length > 0 && (
                        <details className="audit-details">
                          <summary>Xem lý do</summary>
                          <ul>
                            {event.reasonCodes.map((reason, index) => (
                              <li key={`${reason}-${index}`}>
                                {readable(reason)}
                              </li>
                            ))}
                          </ul>
                          {event.evidenceIds.length > 0 && (
                            <p>
                              Nguồn: {event.evidenceIds.join(", ")}
                            </p>
                          )}
                        </details>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
