"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import type { AutonomyBrief, AutonomyMode, AutonomySettings, InboxResponse } from "@/domain/contracts";
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
  const [counts, setCounts] = useState<InboxResponse["counts"] | null>(null);
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
  const [briefOpen, setBriefOpen] = useState(true);
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
          setCounts(response.counts);
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
              setCounts(null);
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
    void client.updateAutonomy({ visitThrough: brief.asOf }).catch((error: unknown) => setAutonomyError(`Visit could not be saved. ${errorMessage(error)}`));
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
        setCounts(null);
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
    setCounts(null);
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
        Skip to inbox
      </a>
      <header className="topbar">
        <Link
          className="brand"
          href={mode === "sample" ? "/?preview=1" : "/"}
          aria-label="Escala inbox"
        >
          <span className="brand-mark" aria-hidden="true">
            e
          </span>
          <span>
            escala<span className="brand-period">.</span>
          </span>
        </Link>
        <span className="topbar-divider" />
        <h1 className="workspace-label" id="inbox-heading" tabIndex={-1}>Inbox</h1>
        {counts && <span className="topbar-count">{counts.needsReview} need review</span>}
        <div className="topbar-actions">
          <label className={`autonomy-control autonomy-${settings?.mode ?? "unknown"}`} title={autonomyError ?? "Backend enforced autonomy · simulated delivery"}>
            <Icon name={settings?.mode === "ON" ? "spark" : "shield"} size={15} />
            <select aria-label="Escala autonomy" disabled={!settings || updatingMode || mode === "sample"} value={settings?.mode ?? "unknown"} onChange={(event) => { void changeAutonomy(event.target.value as AutonomyMode); }}>
              {!settings && <option value="unknown">{mode === "sample" ? "Static preview" : "Autonomy unavailable"}</option>}
              <option value="ON">Escala active</option><option value="DRAFT_ONLY">Draft only</option><option value="PAUSED">Escala paused</option>
            </select>
          </label>
          <label className="theme-picker">
            <Icon name={theme === "dark" ? "moon" : theme === "light" ? "sun" : "monitor"} size={16} />
            <span className="sr-only">Color theme</span>
            <select aria-label="Color theme" value={theme} onChange={(event) => changeTheme(event.target.value as ThemePreference)}>
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <span className="environment-label">
            <span className="environment-dot" />
            {mode === "sample" ? "Sample preview" : "Synthetic workspace"}
          </span>
          <button
            className="mode-switch"
            aria-label={mode === "sample" ? "Connect workspace" : "Sample preview"}
            onClick={() => changeMode(mode === "sample" ? "api" : "sample")}
          >
            <Icon name={mode === "sample" ? "inbox" : "file"} size={15} />
            <span>
              {mode === "sample" ? "Connect workspace" : "Sample preview"}
            </span>
          </button>
          <span
            className="seller-avatar"
            title="Seller review workspace"
            aria-hidden="true"
          >
            S
          </span>
        </div>
      </header>
      <div className="shell-body">
        <main className="workspace" id="workspace" tabIndex={-1}>
          <div
            className={`workspace-banner${mode === "sample" ? " sample-banner" : ""}`}
          >
            <Icon name={mode === "sample" ? "info" : "shield"} size={15} />
            <span>
              {mode === "sample"
                ? "Sample preview. Illustrative recommendations and replies stay in this browser session and reset on reload."
                : "Synthetic buyer messages. Replies are saved in Escala with simulated delivery; no marketplace messages or order changes occur."}
            </span>
            {mode === "sample" && (
              <button className="text-button" onClick={() => changeMode("api")}>
                Use workspace data
              </button>
            )}
          </div>
          {mode === "api" && autonomyError && <div className="autonomy-error" role="status">{autonomyError}</div>}
          {brief && <section className={`seller-brief${briefOpen ? " is-open" : ""}`} aria-label="Opening activity brief">
            <div className="brief-heading">
              <Icon name="spark" size={18} />
              <div><h2>{brief.firstVisit ? "Your workspace at a glance" : "While you were away"}</h2><p>{brief.since ? `Since ${dateLabel(brief.since, true)}` : "Recorded workspace activity"} · through {dateLabel(brief.asOf)}</p></div>
              <div className="brief-totals"><span><strong>{brief.counts.automaticReplies}</strong> automatic replies</span><span><strong>{brief.counts.needsReview + brief.counts.approvalRequired}</strong> currently need you</span></div>
              <button className="text-button" onClick={() => setBriefOpen(!briefOpen)} aria-expanded={briefOpen}>{briefOpen ? "Hide brief" : "View brief"}</button>
            </div>
            {briefOpen && <div className="brief-content">
              <p className="brief-summary">{brief.counts.incoming === 0 && brief.events.length === 0 && brief.orderUpdates.length === 0 ? "No new activity in this period." : `In this period: ${brief.counts.incoming} incoming messages · ${brief.counts.resolved} resolved${brief.counts.failed ? ` · ${brief.counts.failed} failed sends` : ""}${brief.counts.escalated ? ` · ${brief.counts.escalated} escalated` : ""}`}{` · ${brief.counts.approvalRequired} currently awaiting approval`}</p>
              {(brief.events.length > 0 || brief.orderUpdates.length > 0) && <details className="brief-events"><summary>Activity & order updates</summary><ul>{[...brief.orderUpdates, ...brief.events].slice(0, 12).map((event) => <li key={event.id}><button className="text-button" onClick={() => selectThread(event.threadId)}><strong>{event.buyerName}</strong> · {readable(event.action)}</button>{event.reasons[0] && <span>{readable(event.reasons[0])}</span>}</li>)}</ul></details>}
              {brief.counts.needsReview + brief.counts.approvalRequired > 0 && <button className="button secondary" onClick={() => { setFilter("needs-you"); const first = queue.status === "ready" ? queue.threads.find(needsSeller) : null; if (first) selectThread(first.id); setBriefOpen(false); }}>Review conversations <Icon name="chevron" size={14} /></button>}
            </div>}
          </section>}
          {refreshError && (
            <div className="refresh-error">
              <Notice variant="error">
                {refreshError} You’re viewing the last loaded inbox.{" "}
                <button className="text-button" onClick={refreshQueue}>
                  Retry refresh
                </button>
              </Notice>
            </div>
          )}
          <div className="workspace-grid">
            <aside className="desktop-queue" aria-label="Conversation queue">
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
                        ? "Let’s reconnect your inbox"
                        : queue.status === "loading"
                          ? "Getting your workspace ready"
                          : "Room for a thoughtful reply"
                    }
                    action={
                      <div className="empty-actions">
                        {queue.status === "error" && (
                          <>
                            <button
                              className="button secondary"
                              onClick={refreshQueue}
                            >
                              Try again
                            </button>
                            <button
                              className="text-button"
                              onClick={() => changeMode("sample")}
                            >
                              Explore sample inbox
                            </button>
                          </>
                        )}
                        <button
                          className="button secondary mobile-queue-toggle"
                          onClick={() => setQueueOpen(true)}
                        >
                          Open conversations
                        </button>
                      </div>
                    }
                  >
                    {queue.status === "error"
                      ? "Your conversation list couldn’t be loaded. Retry the connection or explore clearly labeled sample conversations."
                      : queue.status === "loading"
                        ? "Loading conversations, evidence, and recorded decisions."
                        : "Choose a conversation to review its context and decide what happens next."}
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
        title="Conversations"
        side="left"
      >
        <ConversationQueue {...queueProps} />
      </Drawer>
    </div>
  );
}
