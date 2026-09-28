"use client";

import { useId } from "react";
import type { InboxThreadSummary } from "@/domain/contracts";
import { Icon } from "@/components/ui/icon";
import {
  Avatar,
  dateLabel,
  EmptyState,
  LoadingState,
} from "./presentation";

export type QueueState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; threads: InboxThreadSummary[] };
export type QueueFilter = "all" | "unread" | "urgent";

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
        (filter === "unread" ? thread.unread : thread.urgency === "high")) &&
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
          Conversations <span>{threads.length}</span>
        </h2>
        <button
          className="icon-button"
          onClick={onRetry}
          disabled={refreshing || state.status === "loading"}
          aria-label="Refresh inbox"
        >
          <Icon name="refresh" size={17} className={refreshing ? "spin" : ""} />
        </button>
      </div>
      <div className="queue-tools">
        <label htmlFor={searchId} className="sr-only">
          Search conversations
        </label>
        <div className="search-field">
          <Icon name="search" size={18} />
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search conversations"
            autoComplete="off"
          />
        </div>
        <div
          className="filter-tabs"
          role="group"
          aria-label="Filter conversations"
        >
          {(
            [
              ["all", "All"],
              ["unread", "Unread"],
              ["urgent", "Urgent"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
              {value === "urgent" &&
                threads.some((thread) => thread.urgency === "high") && (
                  <span className="tab-count">
                    {
                      threads.filter((thread) => thread.urgency === "high")
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
          ? `${matches.length} ${matches.length === 1 ? "conversation" : "conversations"}${query ? " found" : ""}`
          : state.status === "loading"
            ? "Opening your inbox"
            : "Connection needs attention"}
        <span>Prioritized</span>
      </div>
      <div className="queue-scroll">
        {state.status === "loading" ? (
          <LoadingState />
        ) : state.status === "error" ? (
          <EmptyState
            icon="alert"
            title="Inbox unavailable"
            action={
              <div className="empty-actions">
                <button className="button secondary" onClick={onRetry}>
                  Try again
                </button>
                {onPreview && (
                  <button className="text-button" onClick={onPreview}>
                    Explore sample inbox
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
                ? "Your inbox is clear"
                : "No conversations found"
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
                  Clear search and filters
                </button>
              ) : undefined
            }
          >
            {threads.length === 0
              ? "Conversations will appear here when the workspace has messages to review."
              : "Try another name, order number, or message, or clear the filters."}
          </EmptyState>
        ) : (
          <ul className="conversation-list" aria-label="Conversations">
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
                      title={`Last activity: ${dateLabel(thread.updatedAt, true)}`}
                    >
                      {dateLabel(thread.updatedAt)}
                    </time>
                    {thread.unread && (
                      <span className="unread-dot">
                        <span className="sr-only">Unread</span>
                      </span>
                    )}
                  </div>
                  <p className="case-preview">{thread.preview}</p>
                  {(thread.urgency === "high" || thread.requiresAction) && <div className="case-tags">
                    {thread.urgency === "high" && <span className="badge level-high">Urgent</span>}
                    {thread.requiresAction === true && (
                      <span className="badge action-needed">Needs review</span>
                    )}
                  </div>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="queue-footer">
        <Icon name="shield" size={14} />
        <span>Every decision stays with you.</span>
      </div>
    </div>
  );
}
