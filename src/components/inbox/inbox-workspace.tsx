"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import type { AutonomyBrief, AutonomyMode, AutonomySettings } from "@/domain/contracts";
import { Drawer } from "@/components/ui/drawer";
import { Icon } from "@/components/ui/icon";
import { apiClient, errorMessage } from "./api";
import {
  ConversationQueue,
  type QueueState,
  type QueueFilter,
} from "./conversation-queue";
import type { ContextTab } from "./context-panel";
import { dateLabel, EmptyState, needsSeller, Notice, readable } from "./presentation";
import { createSampleClient } from "./sample-data";
import { ThreadWorkspace, type ComposerDraft } from "./thread-workspace";

type Mode = "api" | "sample";
type ThemePreference = "system" | "light" | "dark";

function getThemePreference(): ThemePreference {
  const preference = document.documentElement.dataset.themePreference;
  return preference === "light" || preference === "dark" ? preference : "system";
}
function applyTheme(preference: ThemePreference) {
  const dark = preference === "dark" || (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.dataset.themePreference = preference;
}
function subscribeTheme(callback: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const update = () => { applyTheme(getThemePreference()); callback(); };
  const storage = (event: StorageEvent) => {
    if (event.key !== "escala-theme" && event.key !== null) return;
    applyTheme(event.newValue === "light" || event.newValue === "dark" ? event.newValue : "system");
    callback();
  };
  media.addEventListener("change", update);
  window.addEventListener("escala-theme-change", update);
  window.addEventListener("storage", storage);
  return () => {
    media.removeEventListener("change", update);
    window.removeEventListener("escala-theme-change", update);
    window.removeEventListener("storage", storage);
  };
}
function changeTheme(preference: ThemePreference) {
  applyTheme(preference);
  try { localStorage.setItem("escala-theme", preference); } catch { /* Theme still works for this session. */ }
  window.dispatchEvent(new Event("escala-theme-change"));
}
function getServerTheme(): ThemePreference { return "system"; }

export function InboxWorkspace({
  initialMode = "api",
  initialThreadId = null,
}: {
  initialMode?: Mode;
  initialThreadId?: string | null;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const theme = useSyncExternalStore(subscribeTheme, getThemePreference, getServerTheme);
  const [sampleClient] = useState(createSampleClient);
  const client = mode === "sample" ? sampleClient : apiClient;
  const [queue, setQueue] = useState<QueueState>({ status: "loading" });
  const [selectedId, setSelectedId] = useState<string | null>(initialThreadId);
  const [queueOpen, setQueueOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [contextTab, setContextTab] = useState<ContextTab>("analysis");
  const [drafts, setDrafts] = useState<
    Record<string, ComposerDraft>
  >({});
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<QueueFilter>("needs-you");
  const [settings, setSettings] = useState<AutonomySettings | null>(null);
  const [brief, setBrief] = useState<AutonomyBrief | null>(null);
  const [briefOpen, setBriefOpen] = useState(false);
  const [autonomyError, setAutonomyError] = useState<string | null>(null);
  const [updatingMode, setUpdatingMode] = useState(false);
  const acknowledged = useRef(new Set<string>());
  const queueRequest = useRef<AbortController | null>(null);

  const loadQueue = useCallback(
    (silent = false) => {
      queueRequest.current?.abort();
      const controller = new AbortController();
      queueRequest.current = controller;
      return client
        .inbox(controller.signal)
        .then((response) => {
          if (controller.signal.aborted) return;
          setQueue((previous) => {
            // A decision may update counts, but must not move a row under the seller’s pointer.
            const byId = new Map(
              response.threads.map((thread) => [thread.id, thread]),
            );
            const previousIds =
              previous.status === "ready"
                ? new Set(previous.threads.map((thread) => thread.id))
                : new Set<string>();
            const ordered =
              silent && previous.status === "ready"
                ? [
                    ...previous.threads.flatMap((thread) =>
                      byId.has(thread.id) ? [byId.get(thread.id)!] : [],
                    ),
                    ...response.threads.filter(
                      (thread) => !previousIds.has(thread.id),
                    ),
                  ]
                : response.threads;
            return { status: "ready", threads: ordered };
          });
          setSelectedId((current) =>
            current && response.threads.some((thread) => thread.id === current)
              ? current
              : (response.threads.find(needsSeller)?.id ?? response.threads[0]?.id ?? null),
          );
          setRefreshError(null);
          setRefreshing(false);
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            if (silent) setRefreshError(errorMessage(error));
            else {
              setQueue({ status: "error", error: errorMessage(error) });
            }
            setRefreshing(false);
          }
        });
    },
    [client],
  );

  useEffect(() => {
    void loadQueue();
    const timer = setInterval(() => { void loadQueue(true); }, 5000);
    return () => { clearInterval(timer); queueRequest.current?.abort(); };
  }, [loadQueue]);
  useEffect(() => {
    const controller = new AbortController();
    client.autonomy(controller.signal).then((response) => {
      if (controller.signal.aborted) return;
      setSettings((current) => current && current.version > response.settings.version ? current : response.settings);
      setBrief(response.brief);
      setAutonomyError(null);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) { setSettings(null); setBrief(null); setAutonomyError(errorMessage(error)); }
    });
    const timer = setInterval(() => {
      void client.autonomy(controller.signal).then((response) => {
        if (controller.signal.aborted) return;
        // Refresh authoritative controls without replacing or acknowledging the opening brief.
        setSettings((current) => current && current.version > response.settings.version ? current : response.settings);
        setAutonomyError(null);
      }).catch((error: unknown) => {
        if (!controller.signal.aborted) { setSettings(null); setAutonomyError(errorMessage(error)); }
      });
    }, 5000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [client]);
  useEffect(() => {
    if (!brief || mode === "sample" || acknowledged.current.has(brief.asOf)) return;
    // Acknowledge only the snapshot that has reached the rendered opening brief.
    acknowledged.current.add(brief.asOf);
    void client.updateAutonomy({ visitThrough: brief.asOf }).catch((error: unknown) => setAutonomyError(`Chưa lưu được mốc truy cập. ${errorMessage(error)}`));
  }, [brief, client, mode]);

  async function changeAutonomy(nextMode: AutonomyMode) {
    if (!settings || updatingMode) return;
    setUpdatingMode(true);
    setAutonomyError(null);
    try {
      const response = await client.updateAutonomy({ mode: nextMode, expectedVersion: settings.version });
      setSettings(response.settings);
      void loadQueue(true);
    } catch (error) {
      setAutonomyError(errorMessage(error));
      try { const response = await client.autonomy(); setSettings(response.settings); } catch { setSettings(null); }
    } finally { setUpdatingMode(false); }
  }
  useEffect(() => {
    function restoreLocation() {
      const params = new URLSearchParams(window.location.search);
      const newMode = params.get("preview") === "1" ? "sample" : "api";
      if (newMode !== mode) {
        setQueue({ status: "loading" });
        setSettings(null);
        setBrief(null);
        setMode(newMode);
      }
      setSelectedId(params.get("thread"));
      setQueueOpen(false);
      setContextOpen(false);
    }
    window.addEventListener("popstate", restoreLocation);
    return () => window.removeEventListener("popstate", restoreLocation);
  }, [mode]);

  function updateLocation(nextMode: Mode, threadId: string | null) {
    const url = new URL(window.location.href);
    if (nextMode === "sample") url.searchParams.set("preview", "1");
    else url.searchParams.delete("preview");
    if (threadId) url.searchParams.set("thread", threadId);
    else url.searchParams.delete("thread");
    window.history.pushState(null, "", url);
  }
  function changeMode(nextMode: Mode) {
    setMode(nextMode);
    setQueue({ status: "loading" });
    setSelectedId(null);
    setRefreshError(null);
    setQueueOpen(false);
    setContextOpen(false);
    setQuery("");
    setFilter("needs-you");
    setSettings(null);
    setBrief(null);
    setAutonomyError(null);
    updateLocation(nextMode, null);
  }
  function selectThread(id: string) {
    setSelectedId(id);
    setQueueOpen(false);
    setContextOpen(false);
    updateLocation(mode, id);
  }
  function refreshQueue() {
    setRefreshing(true);
    void loadQueue(queue.status === "ready");
  }
  const quietBrief = brief && brief.counts.incoming === 0 && brief.counts.automaticReplies === 0 && brief.counts.resolved === 0 && brief.counts.failed === 0 && brief.counts.escalated === 0 && brief.events.length === 0 && brief.orderUpdates.length === 0;
  const queueProps = {
    state: queue,
    selectedId,
    onSelect: selectThread,
    onRetry: refreshQueue,
    onPreview: mode === "api" ? () => changeMode("sample") : undefined,
    refreshing,
    query,
    filter,
    onQueryChange: setQuery,
    onFilterChange: setFilter,
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace">
        Chuyển tới hộp thư
      </a>
      <header className="topbar">
        <Link
          className="brand"
          href={mode === "sample" ? "/?preview=1" : "/"}
          aria-label="Hộp thư Escala"
        >
          <span className="brand-mark" aria-hidden="true">
            e
          </span>
          <span>
            escala<span className="brand-period">.</span>
          </span>
        </Link>
        <span className="topbar-divider" />
        <h1 className="workspace-label" id="inbox-heading" tabIndex={-1}>Hộp thư</h1>
        <div className="topbar-actions">
          <label className={`autonomy-control autonomy-${settings?.mode ?? "unknown"}`} title={autonomyError ?? "Chọn tự xử lý và gửi mô phỏng, chỉ soạn nháp, hoặc tạm dừng"}>
            <Icon name={settings?.mode === "ON" ? "spark" : "shield"} size={15} />
            <select aria-describedby="autonomy-help" aria-label="Chế độ xử lý của Escala" disabled={!settings || updatingMode || mode === "sample"} value={settings?.mode ?? "unknown"} onChange={(event) => { void changeAutonomy(event.target.value as AutonomyMode); }}>
              {!settings && <option value="unknown">{mode === "sample" ? "Xem thử tĩnh" : "Chưa tải được chế độ"}</option>}
              <option value="ON">Tự xử lý (mô phỏng)</option><option value="DRAFT_ONLY">Chỉ soạn nháp</option><option value="PAUSED">Tạm dừng</option>
            </select>
          </label>
          <label className="theme-picker">
            <Icon name={theme === "dark" ? "moon" : theme === "light" ? "sun" : "monitor"} size={16} />
            <span className="sr-only">Giao diện màu</span>
            <select aria-label="Giao diện màu" value={theme} onChange={(event) => changeTheme(event.target.value as ThemePreference)}>
              <option value="system">Theo hệ thống</option>
              <option value="light">Sáng</option>
              <option value="dark">Tối</option>
            </select>
          </label>
          <details className="demo-disclosure">
            <summary><span className="environment-dot" />Chế độ demo</summary>
            <div className="demo-details">
              <strong>{mode === "sample" ? "Bản xem thử" : "Không gian demo"}</strong>
              <p>Dữ liệu khách hàng giả lập. Chỉ gửi mô phỏng; không gửi tin hoặc thay đổi đơn hàng trên sàn.</p>
              <p>{mode === "sample" ? "Câu trả lời minh họa chỉ lưu trong phiên trình duyệt và mất khi tải lại. Không gọi AI trực tiếp." : "Tùy cấu hình, bản nháp do OpenAI tạo, từ dữ liệu kiểm thử hoặc mẫu dự phòng. Xem phân tích để kiểm tra nguồn của từng bản nháp."}</p>
              <button className="text-button" onClick={() => changeMode(mode === "sample" ? "api" : "sample")}>{mode === "sample" ? "Mở không gian đã lưu" : "Mở bản xem thử"}</button>
            </div>
          </details>
        </div>
      </header>
      <p className="mode-help" id="autonomy-help">
        <Icon name="shield" size={14} />
        {mode === "sample"
          ? "Bản xem thử: dữ liệu chỉ ở phiên này, tải lại sẽ mất. Không gọi AI hay gửi đến sàn."
          : settings?.mode === "ON"
            ? "Tự xử lý: Escala chuẩn bị và gửi mô phỏng câu trả lời đủ điều kiện. Việc nhạy cảm vẫn cần bạn duyệt."
            : settings?.mode === "DRAFT_ONLY"
              ? "Chỉ soạn nháp: Escala chuẩn bị nội dung, bạn kiểm tra và gửi mô phỏng."
              : settings?.mode === "PAUSED"
                ? "Tạm dừng tự động: bạn vẫn có thể tự soạn và gửi mô phỏng."
                : "Chưa tải được chế độ xử lý. Đây là demo, chưa gửi tin đến sàn."}
      </p>
      <div className="shell-body">
        <main className="workspace" id="workspace" tabIndex={-1}>
          {mode === "api" && autonomyError && <div className="autonomy-error" role="status">{autonomyError}</div>}
          {brief && <section className={`seller-brief${briefOpen ? " is-open" : ""}`} aria-label="Tóm tắt hoạt động khi mở hộp thư">
            <div className="brief-heading">
              <Icon name="spark" size={18} />
              <div className="brief-story"><h2>{brief.firstVisit ? "Tổng quan hộp thư" : "Trong lúc bạn vắng mặt"}</h2>
                <p className="brief-narrative">{quietBrief ? brief.firstVisit ? "Chưa ghi nhận hoạt động." : "Chưa có hoạt động mới từ lần truy cập trước." : `${brief.counts.incoming} tin nhắn mới. Escala đã tự động gửi mô phỏng ${brief.counts.automaticReplies} câu trả lời.`} <span className="brief-backlog">{brief.counts.needsReview + brief.counts.approvalRequired} hội thoại đang chờ bạn xử lý.</span></p>
                <p>{brief.since ? `Từ ${dateLabel(brief.since, true)}` : "Hoạt động đã ghi nhận"} · đến {dateLabel(brief.asOf, true)}. Ảnh chụp trạng thái khi mở hộp thư.</p>
              </div>
              <button className="text-button" onClick={() => setBriefOpen(!briefOpen)} aria-expanded={briefOpen} aria-controls="opening-summary">{briefOpen ? "Thu gọn" : "Xem chi tiết"}</button>
            </div>
            {briefOpen && <div className="brief-content" id="opening-summary">
              <p className="brief-summary">Trong kỳ: {brief.counts.resolved} hội thoại kết thúc · {brief.counts.failed} lần gửi mô phỏng lỗi · {brief.counts.escalated} lần chuyển phụ trách. Khi mở: {brief.counts.needsReview} cần kiểm tra · {brief.counts.approvalRequired} cần phê duyệt.</p>
              {brief.events.length === 0 && brief.orderUpdates.length === 0 ? <p className="brief-summary">Chưa có hoạt động trong khoảng thời gian này.</p> : <div className="brief-events"><ul>{[...brief.orderUpdates, ...brief.events].slice(0, 12).map((event) => <li key={event.id}><button className="text-button" onClick={() => selectThread(event.threadId)}><strong>{event.buyerName}</strong> · {readable(event.action)}</button><time dateTime={event.createdAt}>{dateLabel(event.createdAt, true)}</time>{event.reasons[0] && <span>{readable(event.reasons[0])}</span>}</li>)}</ul></div>}
              {brief.counts.needsReview + brief.counts.approvalRequired > 0 && <button className="button secondary" onClick={() => { setFilter("needs-you"); const first = queue.status === "ready" ? queue.threads.find(needsSeller) : null; if (first) selectThread(first.id); setBriefOpen(false); }}>Xem hội thoại cần xử lý <Icon name="chevron" size={14} /></button>}
            </div>}
          </section>}
          {refreshError && (
            <div className="refresh-error">
              <Notice variant="error">
                {refreshError} Bạn đang xem dữ liệu hộp thư đã tải gần nhất.{" "}
                <button className="text-button" onClick={refreshQueue}>
                  Thử làm mới lại
                </button>
              </Notice>
            </div>
          )}
          <div className="workspace-grid">
            <aside className="desktop-queue" aria-label="Danh sách hội thoại">
              <ConversationQueue {...queueProps} />
            </aside>
            <div className="active-workspace">
              {selectedId && queue.status === "ready" ? (
                <ThreadWorkspace
                  key={`${mode}:${selectedId}`}
                  id={selectedId}
                  client={client}
                  sample={mode === "sample"}
                  contextTab={contextTab}
                  onContextTab={setContextTab}
                  contextOpen={contextOpen}
                  onContextClose={() => setContextOpen(false)}
                  onContextOpen={() => setContextOpen(true)}
                  onQueueOpen={() => setQueueOpen(true)}
                  drafts={drafts}
                  onDraftChange={(key, draft) =>
                    setDrafts((current) => ({ ...current, [key]: draft }))
                  }
                  onChanged={() => {
                    void loadQueue(true);
                  }}
                />
              ) : (
                <div className="workspace-welcome">
                  <div className="welcome-illustration" aria-hidden="true">
                    <span className="welcome-line" />
                    <Icon
                      name={queue.status === "error" ? "alert" : "inbox"}
                      size={42}
                    />
                    <span className="welcome-line" />
                  </div>
                  <EmptyState
                    title={
                      queue.status === "error"
                        ? "Kết nối lại hộp thư"
                        : queue.status === "loading"
                          ? "Đang chuẩn bị không gian làm việc"
                          : "Chọn hội thoại để bắt đầu"
                    }
                    action={
                      <div className="empty-actions">
                        {queue.status === "error" && (
                          <>
                            <button
                              className="button secondary"
                              onClick={refreshQueue}
                            >
                              Thử lại
                            </button>
                            <button
                              className="text-button"
                              onClick={() => changeMode("sample")}
                            >
                              Khám phá hộp thư mẫu
                            </button>
                          </>
                        )}
                        <button
                          className="button secondary mobile-queue-toggle"
                          onClick={() => setQueueOpen(true)}
                        >
                          Mở danh sách hội thoại
                        </button>
                      </div>
                    }
                  >
                    {queue.status === "error"
                      ? "Chưa tải được danh sách hội thoại. Thử kết nối lại hoặc mở hộp thư mẫu."
                      : queue.status === "loading"
                        ? "Đang tải hội thoại, nguồn tham chiếu và quyết định đã lưu."
                        : "Chọn hội thoại để xem ngữ cảnh và bước xử lý tiếp theo."}
                  </EmptyState>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
      <Drawer
        open={queueOpen}
        onClose={() => setQueueOpen(false)}
        title="Hội thoại"
        side="left"
      >
        <ConversationQueue {...queueProps} />
      </Drawer>
    </div>
  );
}
