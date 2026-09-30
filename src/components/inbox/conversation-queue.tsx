"use client";

import { useId } from "react";
import type { InboxThreadSummary } from "@/domain/contracts";
import { Icon } from "@/components/ui/icon";
import {
  Avatar,
  dateLabel,
  EmptyState,
  LoadingState,
  needsSeller,
  autoHandled,
  conversationLabel,
  readable,
} from "./presentation";

export type QueueState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; threads: InboxThreadSummary[] };
export type QueueFilter = "needs-you" | "auto-handled" | "all";

export function ConversationQueue({
  state,
  selectedId,
  onSelect,
  onRetry,
  onPreview,
  refreshing,
  query,
  filter,
  onQueryChange: setQuery,
  onFilterChange: setFilter,
}: {
  state: QueueState;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRetry: () => void;
  onPreview?: () => void;
  refreshing: boolean;
  query: string;
  filter: QueueFilter;
  onQueryChange: (query: string) => void;
  onFilterChange: (filter: QueueFilter) => void;
}) {
  const searchId = useId();
  const threads = state.status === "ready" ? state.threads : [];
  const matches = threads.filter(
    (thread) =>
      (filter === "all" ||
        (filter === "needs-you" ? needsSeller(thread) : autoHandled(thread))) &&
      [
        thread.buyerName,
        thread.preview,
        thread.orderId,
        thread.productName,
        thread.intent,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );

  return (
    <div className="queue">
      <div className="queue-heading">
        <h2>
          Hộp thư <span>{threads.length}</span>
        </h2>
        <button
          className="icon-button"
          onClick={onRetry}
          disabled={refreshing || state.status === "loading"}
          aria-label="Làm mới hộp thư"
        >
          <Icon name="refresh" size={17} className={refreshing ? "spin" : ""} />
        </button>
      </div>
      <div className="queue-tools">
        <label htmlFor={searchId} className="sr-only">
          Tìm hội thoại
        </label>
        <div className="search-field">
          <Icon name="search" size={18} />
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm hội thoại"
            autoComplete="off"
          />
        </div>
        <div
          className="filter-tabs"
          role="group"
          aria-label="Lọc hội thoại"
        >
          {(
            [
              ["needs-you", "Cần xử lý"],
              ["auto-handled", "Đã xử lý"],
              ["all", "Tất cả"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
              {value === "needs-you" &&
                threads.some(needsSeller) && (
                  <span className="tab-count">
                    {
                      threads.filter(needsSeller)
                        .length
                    }
                  </span>
                )}
            </button>
          ))}
        </div>
      </div>
      <div className="queue-results" aria-live="polite">
        {state.status === "ready"
          ? `${matches.length} hội thoại${query ? " phù hợp" : ""}`
          : state.status === "loading"
            ? "Đang mở hộp thư"
            : "Cần kiểm tra kết nối"}
      </div>
      <div className="queue-scroll">
        {state.status === "loading" ? (
          <LoadingState />
        ) : state.status === "error" ? (
          <EmptyState
            icon="alert"
            title="Chưa tải được hộp thư"
            action={
              <div className="empty-actions">
                <button className="button secondary" onClick={onRetry}>
                  Thử lại
                </button>
                {onPreview && (
                  <button className="text-button" onClick={onPreview}>
                    Khám phá hộp thư mẫu
                  </button>
                )}
              </div>
            }
          >
            {state.error}
          </EmptyState>
        ) : matches.length === 0 ? (
          <EmptyState
            icon="search"
            title={
              threads.length === 0
                ? "Hộp thư chưa có tin nhắn"
                : "Không tìm thấy hội thoại"
            }
            action={
              threads.length > 0 ? (
                <button
                  className="text-button"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                >
                  Xóa tìm kiếm và bộ lọc
                </button>
              ) : undefined
            }
          >
            {threads.length === 0
              ? "Hội thoại sẽ xuất hiện khi có tin nhắn cần xử lý."
              : "Thử tìm theo tên, mã đơn hoặc nội dung khác; hoặc xóa bộ lọc."}
          </EmptyState>
        ) : (
          <ul className="conversation-list" aria-label="Hội thoại">
            {matches.map((thread) => (
              <li key={thread.id}>
                <button
                  className={`case-row${selectedId === thread.id ? " is-selected" : ""}${thread.unread ? " is-unread" : ""}`}
                  onClick={() => onSelect(thread.id)}
                  aria-current={selectedId === thread.id ? "true" : undefined}
                >
                  <Avatar name={thread.buyerName} />
                  <div className="case-body">
                  <div className="case-top">
                    <span className="case-name">{thread.buyerName}</span>
                    <time
                      dateTime={thread.updatedAt}
                      title={`Hoạt động gần nhất: ${dateLabel(thread.updatedAt, true)}`}
                    >
                      {dateLabel(thread.updatedAt)}
                    </time>
                    {thread.unread && (
                      <span className="unread-dot">
                        <span className="sr-only">Chưa đọc</span>
                      </span>
                    )}
                  </div>
                  <p className="case-preview">{thread.preview}</p>
                  <div className="case-tags">
                    <span className={`conversation-status status-${thread.conversationState ?? "unknown"}`}>{conversationLabel(thread)}</span>
                    {thread.urgency !== "low" && (
                      <span className="priority-note">
                        <Icon name="clock" size={12} />
                        <span>{thread.urgencyReasons.length
                          ? thread.urgencyReasons.map(readable).join(" · ")
                          : "Cần kiểm tra thời hạn của yêu cầu"}</span>
                      </span>
                    )}
                  </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
