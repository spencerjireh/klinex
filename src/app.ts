import {
  BoxRenderable,
  CliRenderEvents,
  type CliRenderer,
  createCliRenderer,
  InputRenderable,
  InputRenderableEvents,
  KeyEvent,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
} from "@opentui/core";
import { openUrl, stopProcess } from "./actions.ts";
import { discoverServers, mergeEntryState } from "./discovery.ts";
import { cycleSortMode, filterAndSortEntries } from "./filter.ts";
import { probeEntries } from "./probe.ts";
import type { ServerEntry, SortMode, StopAction } from "./types.ts";

const AUTO_REFRESH_MS = 5_000;

const COLORS = {
  background: "#050913",
  panel: "#091321",
  panelAlt: "#0d1829",
  panelDeep: "#07101c",
  border: "#173459",
  borderGlow: "#22d3ee",
  borderHot: "#ff4fd8",
  text: "#ecf8ff",
  muted: "#8fb2d3",
  dim: "#5f7798",
  success: "#6ef8c7",
  warning: "#ffd166",
  danger: "#ff87b2",
  selection: "#12385d",
  selectionAlt: "#163f6a",
};

type ModalValue = StopAction | "cancel";

interface AppState {
  entries: ServerEntry[];
  selectedId: string | null;
  query: string;
  showAll: boolean;
  sortMode: SortMode;
  status: string;
  warning: string | null;
  isRefreshing: boolean;
  refreshStartedAt: number | null;
  modalEntryId: string | null;
}

export async function createApp(): Promise<KlinexApp> {
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    screenMode: "alternate-screen",
    useMouse: false,
    backgroundColor: "#0b0f14",
  });

  return new KlinexApp(renderer);
}

export class KlinexApp {
  private readonly renderer: CliRenderer;
  private readonly state: AppState = {
    entries: [],
    selectedId: null,
    query: "",
    showAll: false,
    sortMode: "relevance",
    status: "Scanning for local dev servers...",
    warning: null,
    isRefreshing: false,
    refreshStartedAt: null,
    modalEntryId: null,
  };

  private readonly root: BoxRenderable;
  private readonly header: BoxRenderable;
  private readonly body: BoxRenderable;
  private readonly footer: BoxRenderable;
  private readonly titleText: TextRenderable;
  private readonly summaryText: TextRenderable;
  private readonly searchHintText: TextRenderable;
  private readonly searchInput: InputRenderable;
  private readonly listPanel: BoxRenderable;
  private readonly listHeaderText: TextRenderable;
  private readonly detailPanel: BoxRenderable;
  private readonly listSelect: SelectRenderable;
  private readonly detailText: TextRenderable;
  private readonly statusText: TextRenderable;
  private readonly shortcutsText: TextRenderable;
  private readonly modalBox: BoxRenderable;
  private readonly modalTitleText: TextRenderable;
  private readonly modalBodyText: TextRenderable;
  private readonly modalSelect: SelectRenderable;

  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;

  constructor(renderer: CliRenderer) {
    this.renderer = renderer;

    this.root = new BoxRenderable(renderer, {
      id: "root",
      width: "100%",
      height: "100%",
      flexDirection: "column",
      padding: 1,
      gap: 1,
      backgroundColor: COLORS.background,
    });

    this.header = new BoxRenderable(renderer, {
      id: "header",
      border: true,
      borderStyle: "rounded",
      borderColor: COLORS.borderGlow,
      backgroundColor: COLORS.panelDeep,
      padding: 1,
      height: 6,
      flexDirection: "column",
      gap: 1,
    });
    this.titleText = new TextRenderable(renderer, {
      content: "KLINEX // localhost control surface",
      fg: COLORS.text,
    });
    this.summaryText = new TextRenderable(renderer, {
      content: "",
      fg: COLORS.muted,
    });
    const searchRow = new BoxRenderable(renderer, {
      flexDirection: "row",
      alignItems: "center",
      gap: 1,
      height: 1,
    });
    this.searchHintText = new TextRenderable(renderer, {
      content: "[/] FILTER",
      fg: COLORS.borderHot,
      width: 12,
    });
    this.searchInput = new InputRenderable(renderer, {
      id: "search-input",
      width: 36,
      placeholder: "fuzzy match port, process, framework...",
      backgroundColor: COLORS.panelAlt,
      focusedBackgroundColor: COLORS.panel,
      textColor: COLORS.text,
      cursorColor: COLORS.borderGlow,
    });
    searchRow.add(this.searchHintText);
    searchRow.add(this.searchInput);
    this.header.add(this.titleText);
    this.header.add(this.summaryText);
    this.header.add(searchRow);

    this.body = new BoxRenderable(renderer, {
      id: "body",
      flexGrow: 1,
      flexDirection: "row",
      gap: 1,
    });
    this.listPanel = new BoxRenderable(renderer, {
      id: "list-panel",
      title: "Signal Grid",
      border: true,
      borderStyle: "rounded",
      borderColor: COLORS.border,
      focusedBorderColor: COLORS.borderGlow,
      backgroundColor: COLORS.panel,
      padding: 1,
      flexGrow: 1,
      flexDirection: "column",
      gap: 1,
    });
    this.listHeaderText = new TextRenderable(renderer, {
      content: "",
      fg: COLORS.borderGlow,
      width: "100%",
    });
    this.listSelect = new SelectRenderable(renderer, {
      id: "server-list",
      width: "100%",
      height: "auto",
      flexGrow: 1,
      options: [],
      backgroundColor: COLORS.panel,
      focusedBackgroundColor: COLORS.panel,
      textColor: COLORS.text,
      selectedBackgroundColor: COLORS.selection,
      selectedTextColor: COLORS.text,
      descriptionColor: COLORS.dim,
      selectedDescriptionColor: "#bdefff",
      wrapSelection: true,
      showDescription: true,
      itemSpacing: 0,
    });
    this.listPanel.add(this.listHeaderText);
    this.listPanel.add(this.listSelect);

    this.detailPanel = new BoxRenderable(renderer, {
      id: "detail-panel",
      title: "Trace View",
      border: true,
      borderStyle: "rounded",
      borderColor: COLORS.border,
      backgroundColor: COLORS.panelAlt,
      padding: 1,
      width: "40%",
      minWidth: 34,
    });
    this.detailText = new TextRenderable(renderer, {
      content: "Select a server to inspect it.",
      fg: COLORS.text,
      width: "100%",
      height: "100%",
      wrapMode: "word",
    });
    this.detailPanel.add(this.detailText);

    this.body.add(this.listPanel);
    this.body.add(this.detailPanel);

    this.footer = new BoxRenderable(renderer, {
      id: "footer",
      border: true,
      borderStyle: "rounded",
      borderColor: COLORS.border,
      backgroundColor: COLORS.panelDeep,
      padding: 1,
      height: 4,
      flexDirection: "column",
    });
    this.statusText = new TextRenderable(renderer, {
      content: "",
      fg: COLORS.text,
      wrapMode: "word",
    });
    this.shortcutsText = new TextRenderable(renderer, {
      content: "",
      fg: COLORS.muted,
      wrapMode: "word",
    });
    this.footer.add(this.statusText);
    this.footer.add(this.shortcutsText);

    this.modalBox = new BoxRenderable(renderer, {
      id: "stop-modal",
      position: "absolute",
      top: "18%",
      left: "20%",
      width: "60%",
      height: 11,
      border: true,
      borderStyle: "rounded",
      borderColor: COLORS.borderHot,
      backgroundColor: COLORS.panelDeep,
      padding: 1,
      flexDirection: "column",
      gap: 1,
      visible: false,
      zIndex: 50,
    });
    this.modalTitleText = new TextRenderable(renderer, {
      content: "",
      fg: COLORS.text,
    });
    this.modalBodyText = new TextRenderable(renderer, {
      content: "",
      fg: COLORS.muted,
      wrapMode: "word",
    });
    this.modalSelect = new SelectRenderable(renderer, {
      id: "stop-select",
      width: "100%",
      height: 4,
      options: [],
      backgroundColor: COLORS.panelDeep,
      focusedBackgroundColor: COLORS.panelDeep,
      textColor: COLORS.text,
      selectedBackgroundColor: COLORS.selectionAlt,
      selectedTextColor: COLORS.text,
      descriptionColor: COLORS.muted,
      selectedDescriptionColor: "#c6e1ff",
      showDescription: true,
      wrapSelection: true,
    });
    this.modalBox.add(this.modalTitleText);
    this.modalBox.add(this.modalBodyText);
    this.modalBox.add(this.modalSelect);

    this.root.add(this.header);
    this.root.add(this.body);
    this.root.add(this.footer);
    this.root.add(this.modalBox);
    this.renderer.root.add(this.root);

    this.wireEvents();
    this.applyResponsiveLayout();
    this.render();
  }

  async start(): Promise<void> {
    await this.refresh(true, "Initial scan completed.");
    this.listSelect.focus();
    this.refreshTimer = setInterval(() => {
      void this.refresh(false);
    }, AUTO_REFRESH_MS);
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    if (!this.renderer.isDestroyed) {
      this.renderer.destroy();
    }
  }

  private wireEvents(): void {
    this.searchInput.on(InputRenderableEvents.INPUT, (value: string) => {
      this.state.query = value;
      this.render();
    });

    this.searchInput.on(InputRenderableEvents.ENTER, () => {
      this.listSelect.focus();
      this.render();
    });

    this.listSelect.on(SelectRenderableEvents.SELECTION_CHANGED, (_index: number, option: { value?: string | null } | null) => {
      if (typeof option?.value === "string") {
        this.state.selectedId = option.value;
        this.renderDetails();
        this.renderFooter();
      }
    });

    this.listSelect.on(SelectRenderableEvents.ITEM_SELECTED, async (_index: number, option: { value?: string | null } | null) => {
      if (typeof option?.value !== "string") {
        return;
      }

      this.state.selectedId = option.value;
      await this.openSelected();
    });

    this.modalSelect.on(SelectRenderableEvents.ITEM_SELECTED, async (_index: number, option: { value?: ModalValue } | null) => {
      if (!option?.value || option.value === "cancel") {
        this.closeModal();
        return;
      }

      await this.runStopAction(option.value);
    });

    this.renderer.keyInput.on("keypress", (key: KeyEvent) => {
      void this.handleKeyPress(key);
    });

    this.renderer.on(CliRenderEvents.RESIZE, () => {
      this.applyResponsiveLayout();
      this.render();
    });

    this.renderer.on(CliRenderEvents.DESTROY, () => {
      this.destroyed = true;
      if (this.refreshTimer) {
        clearInterval(this.refreshTimer);
        this.refreshTimer = null;
      }
    });
  }

  private async handleKeyPress(key: KeyEvent): Promise<void> {
    if (key.ctrl && key.name === "c") {
      return;
    }

    if (this.modalBox.visible) {
      if (key.name === "escape") {
        this.closeModal();
      }
      return;
    }

    if (this.searchInput.focused) {
      if (key.name === "escape") {
        this.listSelect.focus();
        this.render();
      }

      if (key.name === "tab") {
        this.listSelect.focus();
        this.render();
      }
      return;
    }

    if (key.name === "q") {
      this.destroy();
      return;
    }

    if (key.name === "/") {
      this.searchInput.focus();
      this.renderFooter();
      return;
    }

    if (key.name === "tab") {
      this.searchInput.focus();
      this.render();
      return;
    }

    if (key.name === "r") {
      await this.refresh(true, "Manual refresh completed.");
      return;
    }

    if (key.name === "a") {
      this.state.showAll = !this.state.showAll;
      this.state.status = this.state.showAll ? "Showing all local TCP listeners." : "Showing likely dev servers only.";
      this.render();
      return;
    }

    if (key.name === "s") {
      this.state.sortMode = cycleSortMode(this.state.sortMode);
      this.state.status = `Sort mode set to ${this.state.sortMode}.`;
      this.render();
      return;
    }

    if (key.name === "x") {
      this.openStopModal();
    }
  }

  private async refresh(forceProbe: boolean, successMessage?: string): Promise<void> {
    if (this.state.isRefreshing || this.destroyed) {
      return;
    }

    this.state.isRefreshing = true;
    this.state.refreshStartedAt = Date.now();
    this.state.status = "Refreshing listener list...";
    this.renderFooter();

    try {
      const discovery = await discoverServers();
      let entries = mergeEntryState(this.state.entries, discovery.entries);
      entries = await probeEntries(entries, this.state.selectedId, forceProbe);

      this.state.entries = entries;
      this.state.warning = discovery.warning;
      this.state.status = successMessage ?? `Last refresh ${formatClock(new Date())}.`;
      this.render();
    } catch (error) {
      this.state.status = error instanceof Error ? error.message : String(error);
      this.renderFooter();
    } finally {
      this.state.isRefreshing = false;
      this.state.refreshStartedAt = null;
      this.renderFooter();
    }
  }

  private async openSelected(): Promise<void> {
    const entry = this.getSelectedEntry();
    if (!entry) {
      return;
    }

    const result = await openUrl(entry.browserUrl);
    this.state.status = result.message;
    this.renderFooter();
  }

  private openStopModal(): void {
    const entry = this.getSelectedEntry();
    if (!entry) {
      this.state.status = "No server selected to stop.";
      this.renderFooter();
      return;
    }

    if (entry.pid === null) {
      this.state.status = "This listener has no visible owning PID. Re-run klinex with sudo if you need stop controls for it.";
      this.renderFooter();
      return;
    }

    const siblingPorts = this.state.entries
      .filter((candidate) => candidate.pid === entry.pid && candidate.id !== entry.id)
      .map((candidate) => candidate.port)
      .sort((left, right) => left - right);

    this.state.modalEntryId = entry.id;
    this.modalTitleText.content = `Confirm stop for PID ${entry.pid}`;
    this.modalBodyText.content = siblingPorts.length > 0
      ? `${entry.processName} also owns ports ${siblingPorts.join(", ")}. Choose whether to stop only this PID or the whole child tree.`
      : `${entry.processName} is serving ${entry.browserUrl}. Choose whether to stop only this PID or the whole child tree.`;
    this.modalSelect.options = [
      { name: "TERM PID", description: "Graceful stop for the selected PID only", value: "term-pid" },
      { name: "KILL PID", description: "Force stop for the selected PID only", value: "kill-pid" },
      { name: "TERM TREE", description: "Graceful stop for the PID and its child processes", value: "term-tree" },
      { name: "KILL TREE", description: "Force stop for the PID and its child processes", value: "kill-tree" },
      { name: "Cancel", description: "Leave the server running", value: "cancel" },
    ];
    this.modalSelect.selectedIndex = 0;
    this.modalBox.visible = true;
    this.modalSelect.focus();
    this.render();
  }

  private closeModal(): void {
    this.modalBox.visible = false;
    this.state.modalEntryId = null;
    this.listSelect.focus();
    this.render();
  }

  private async runStopAction(action: StopAction): Promise<void> {
    const entry = this.state.modalEntryId ? this.state.entries.find((candidate) => candidate.id === this.state.modalEntryId) : null;
    if (!entry || entry.pid === null) {
      this.closeModal();
      this.state.status = "Stop controls require a visible PID.";
      this.renderFooter();
      return;
    }

    this.closeModal();
    this.state.status = `Sending ${action} to PID ${entry.pid}...`;
    this.renderFooter();

    const result = await stopProcess(entry.pid, action);
    this.state.status = result.message;
    this.renderFooter();

    await this.refresh(true, result.message);
  }

  private render(): void {
    const filtered = filterAndSortEntries(
      this.state.entries,
      this.state.selectedId,
      this.state.query,
      this.state.showAll,
      this.state.sortMode,
    );

    this.state.selectedId = filtered.selectedId;
    this.titleText.content = this.searchInput.focused ? "KLINEX // filter engaged" : "KLINEX // localhost control surface";
    this.summaryText.content = this.buildSummary(filtered.entries.length);
    this.renderList(filtered.entries);
    this.renderDetails();
    this.renderFooter();
  }

  private renderList(entries: ServerEntry[]): void {
    const listWidth = Math.max(56, this.listPanel.width - 6);
    this.listHeaderText.content = formatListHeader(listWidth);

    if (entries.length === 0) {
      this.listSelect.options = [{
        name: "No matching listeners",
        description: this.state.query ? "Clear search, toggle all listeners, or refresh." : "Start a dev server or press r to refresh.",
        value: null,
      }];
      this.listSelect.selectedIndex = 0;
      return;
    }

    const options = entries.map((entry) => ({
      name: formatListName(entry, listWidth),
      description: formatListDescription(entry, listWidth),
      value: entry.id,
    }));

    this.listSelect.options = options;
    const selectedIndex = Math.max(
      0,
      entries.findIndex((entry) => entry.id === this.state.selectedId),
    );
    this.listSelect.selectedIndex = selectedIndex;
  }

  private renderDetails(): void {
    const entry = this.getSelectedEntry();
    if (!entry) {
      this.detailText.content = "No server selected.";
      return;
    }

    this.detailText.content = [
      `${entry.framework ?? "Unclassified"} local server`,
      "",
      "OVERVIEW",
      `Target      ${entry.browserUrl}`,
      `Bind scope  ${entry.displayHost}:${entry.port}`,
      `Bind hosts  ${entry.bindHosts.join(", ")}`,
      `Probe       ${formatProbe(entry)}`,
      `Heuristic   ${entry.devScore} ${entry.isLikelyDev ? "(likely dev)" : "(low confidence)"}`,
      "",
      "PROCESS",
      `Owner       ${entry.ownerKnown ? "visible" : "hidden - relaunch with sudo to inspect/stop"}`,
      `PID         ${entry.pid ?? "hidden"}${entry.ppid ? `   PPID ${entry.ppid}` : ""}`,
      `User        ${entry.user ?? "unknown"}`,
      `Process     ${entry.processName}`,
      "",
      "COMMAND",
      entry.command,
      "",
      "WHY IT MATCHED",
      ...(entry.notes.length > 0 ? entry.notes.map((note) => `- ${note}`) : ["- No heuristic notes available."]),
    ].join("\n");
  }

  private renderFooter(): void {
    const focus = this.modalBox.visible ? "stop dialog" : this.searchInput.focused ? "search" : "list";
    const warningSuffix = this.state.warning ? ` Warning: ${this.state.warning}` : "";
    this.statusText.content = `${this.state.status}${warningSuffix}`;
    this.shortcutsText.content = `FOCUS ${focus.toUpperCase()}  / filter  Tab focus  Enter open  x terminate  a all/dev  s sort  r refresh  q quit`;
  }

  private buildSummary(visibleCount: number): string {
    const mode = this.state.showAll ? "all listeners" : "likely dev only";
    const query = this.state.query.trim() ? `  query ${this.state.query.trim()}` : "";
    const refreshStatus = this.state.isRefreshing && this.state.refreshStartedAt
      ? `refreshing for ${Math.max(1, Math.round((Date.now() - this.state.refreshStartedAt) / 1000))}s`
      : `auto refresh ${AUTO_REFRESH_MS / 1000}s`;

    return `${visibleCount}/${this.state.entries.length} visible  ${mode}  sort ${this.state.sortMode}${query}  ${refreshStatus}`;
  }

  private getSelectedEntry(): ServerEntry | null {
    if (!this.state.selectedId) {
      return null;
    }

    return this.state.entries.find((entry) => entry.id === this.state.selectedId) ?? null;
  }

  private applyResponsiveLayout(): void {
    const narrow = this.renderer.width < 110;
    this.body.flexDirection = narrow ? "column" : "row";
    this.detailPanel.width = narrow ? "100%" : "40%";
    this.detailPanel.height = narrow ? "42%" : "auto";
    this.listPanel.height = narrow ? "58%" : "auto";
    this.searchInput.width = Math.max(24, Math.min(48, Math.floor(this.renderer.width * 0.32)));
    this.modalBox.width = narrow ? "86%" : "60%";
    this.modalBox.left = narrow ? "7%" : "20%";
  }
}

function formatListName(entry: ServerEntry, terminalWidth: number): string {
  const columns = getListColumns(terminalWidth);
  const probe = probeLabel(entry);
  const host = truncate(entry.displayHost, columns.hostWidth);
  const framework = truncate(entry.framework ?? "HTTP?", columns.frameworkWidth);
  const processName = truncate(entry.processName, columns.processWidth);
  const pidLabel = entry.pid === null ? "hidden" : String(entry.pid);
  return `${pad(probe, 6)} ${pad(host, columns.hostWidth)} ${pad(String(entry.port), columns.portWidth)} ${pad(framework, columns.frameworkWidth)} ${pad(processName, columns.processWidth)} ${pad(pidLabel, columns.pidWidth)}`;
}

function formatListDescription(entry: ServerEntry, terminalWidth: number): string {
  const maxWidth = Math.max(40, terminalWidth - 4);
  const title = entry.probe?.title ? `title ${entry.probe.title}` : entry.command;
  return truncate(title, maxWidth);
}

function formatProbe(entry: ServerEntry): string {
  if (!entry.probe) {
    return "Pending probe";
  }

  if (entry.probe.state === "failed") {
    return `Probe failed${entry.probe.error ? `: ${entry.probe.error}` : ""}`;
  }

  const status = entry.probe.status ? ` ${entry.probe.status}` : "";
  const title = entry.probe.title ? `  title: ${entry.probe.title}` : "";
  return `${entry.probe.protocol?.toUpperCase() ?? "HTTP"}${status}${title}`;
}

function probeLabel(entry: ServerEntry): string {
  if (!entry.probe) {
    return "WAIT";
  }

  if (entry.probe.state === "failed") {
    return "MISS";
  }

  return entry.probe.protocol === "https" ? "TLS" : "HTTP";
}

function formatListHeader(terminalWidth: number): string {
  const columns = getListColumns(terminalWidth);
  return `${pad("NET", 6)} ${pad("HOST", columns.hostWidth)} ${pad("PORT", columns.portWidth)} ${pad("APP", columns.frameworkWidth)} ${pad("PROCESS", columns.processWidth)} ${pad("PID", columns.pidWidth)}`;
}

function getListColumns(terminalWidth: number): {
  hostWidth: number;
  portWidth: number;
  frameworkWidth: number;
  processWidth: number;
  pidWidth: number;
} {
  const hostWidth = clamp(Math.floor(terminalWidth * 0.24), 14, 22);
  const portWidth = 5;
  const frameworkWidth = clamp(Math.floor(terminalWidth * 0.12), 8, 12);
  const pidWidth = 7;
  const fixed = 6 + 1 + hostWidth + 1 + portWidth + 1 + frameworkWidth + 1 + pidWidth + 4;
  const processWidth = Math.max(12, terminalWidth - fixed);
  return { hostWidth, portWidth, frameworkWidth, processWidth, pidWidth };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function truncate(value: string, length: number): string {
  if (value.length <= length) {
    return value;
  }

  if (length <= 1) {
    return value.slice(0, length);
  }

  return `${value.slice(0, length - 1)}…`;
}

function pad(value: string, length: number): string {
  return value.length >= length ? value : value.padEnd(length, " ");
}

function formatClock(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
