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
import { SakuraRenderable } from "./sakura.ts";
import type { ServerEntry, SortMode, StopAction } from "./types.ts";

const AUTO_REFRESH_MS = 5_000;

const COLORS = {
  bg: "#00000000",
  surface: "#2a1a1599",
  float: "#3a2218cc",
  selection: "#EC5B2B",
  text: "#eeeeee",
  muted: "#808080",
  dim: "#3c3c3c",
  bright: "#eeeeee",
  border: "#3c3c3c",
  primary: "#EC5B2B",
  secondary: "#EE7948",
  cyan: "#56b6c2",
  teal: "#56b6c2",
  green: "#6ba1e6",
  yellow: "#e5c07b",
  red: "#e06c75",
  orange: "#EC5B2B",
  selectedText: "#0a0a0a",
  accent: "#FFF7F1",
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
  markedIds: Set<string>;
  pendingKey: string | null;
  pendingKeyTimer: ReturnType<typeof setTimeout> | null;
}

export async function createApp(): Promise<KlinexApp> {
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    screenMode: "alternate-screen",
    useMouse: false,
    backgroundColor: "transparent",
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
    markedIds: new Set(),
    pendingKey: null,
    pendingKeyTimer: null,
  };

  private readonly root: BoxRenderable;
  private readonly header: BoxRenderable;
  private readonly body: BoxRenderable;
  private readonly footer: BoxRenderable;
  private readonly titleText: TextRenderable;
  private readonly searchHintText: TextRenderable;
  private readonly searchInput: InputRenderable;
  private readonly listPanel: BoxRenderable;
  private readonly listHeaderText: TextRenderable;
  private readonly detailPanel: BoxRenderable;
  private readonly listSelect: SelectRenderable;
  private readonly emptyArt: SakuraRenderable;
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
      padding: 0,
      paddingLeft: 1,
      paddingRight: 1,
      gap: 0,
      backgroundColor: "transparent",
    });

    this.header = new BoxRenderable(renderer, {
      id: "header",
      border: false,
      backgroundColor: "transparent",
      padding: 0,
      height: 3,
      flexDirection: "column",
      gap: 0,
    });
    this.titleText = new TextRenderable(renderer, {
      content: "",
      fg: COLORS.bright,
    });
    const searchRow = new BoxRenderable(renderer, {
      flexDirection: "row",
      alignItems: "center",
      gap: 1,
      height: 1,
    });
    this.searchHintText = new TextRenderable(renderer, {
      content: "[/]",
      fg: COLORS.primary,
      width: 4,
    });
    this.searchInput = new InputRenderable(renderer, {
      id: "search-input",
      width: 36,
      placeholder: "filter...",
      backgroundColor: "transparent",
      focusedBackgroundColor: COLORS.float,
      textColor: COLORS.text,
      cursorColor: COLORS.primary,
    });
    searchRow.add(this.searchHintText);
    searchRow.add(this.searchInput);
    this.header.add(this.titleText);
    this.header.add(searchRow);

    this.body = new BoxRenderable(renderer, {
      id: "body",
      flexGrow: 1,
      flexDirection: "row",
      gap: 0,
    });
    this.listPanel = new BoxRenderable(renderer, {
      id: "list-panel",
      border: false,
      backgroundColor: "transparent",
      padding: 0,
      flexGrow: 1,
      flexDirection: "column",
      gap: 0,
    });
    this.listHeaderText = new TextRenderable(renderer, {
      content: "",
      fg: COLORS.muted,
      width: "100%",
    });
    this.listSelect = new SelectRenderable(renderer, {
      id: "server-list",
      width: "100%",
      height: "auto",
      flexGrow: 1,
      options: [],
      backgroundColor: "transparent",
      focusedBackgroundColor: "transparent",
      textColor: COLORS.bright,
      selectedBackgroundColor: COLORS.selection,
      selectedTextColor: COLORS.selectedText,
      wrapSelection: true,
      showDescription: false,
      itemSpacing: 0,
    });
    this.emptyArt = new SakuraRenderable(renderer, {
      id: "sakura",
      width: "100%",
      flexGrow: 1,
      visible: false,
    });
    this.listPanel.add(this.listHeaderText);
    this.listPanel.add(this.listSelect);
    this.listPanel.add(this.emptyArt);

    this.detailPanel = new BoxRenderable(renderer, {
      id: "detail-panel",
      border: ["left"],
      borderStyle: "single",
      borderColor: COLORS.border,
      backgroundColor: "transparent",
      paddingLeft: 1,
      padding: 0,
      width: "40%",
      minWidth: 34,
    });
    this.detailText = new TextRenderable(renderer, {
      content: "No server selected.",
      fg: COLORS.bright,
      width: "100%",
      height: "100%",
      wrapMode: "word",
    });
    this.detailPanel.add(this.detailText);

    this.body.add(this.listPanel);
    this.body.add(this.detailPanel);

    this.footer = new BoxRenderable(renderer, {
      id: "footer",
      border: false,
      backgroundColor: "transparent",
      padding: 0,
      height: 1,
      flexDirection: "row",
      justifyContent: "space-between",
    });
    this.statusText = new TextRenderable(renderer, {
      content: "",
      fg: COLORS.muted,
      wrapMode: "none",
      truncate: true,
    });
    this.shortcutsText = new TextRenderable(renderer, {
      content: "",
      fg: COLORS.muted,
      wrapMode: "none",
      truncate: true,
    });
    this.footer.add(this.shortcutsText);
    this.footer.add(this.statusText);

    this.modalBox = new BoxRenderable(renderer, {
      id: "stop-modal",
      position: "absolute",
      top: "18%",
      left: "20%",
      width: "60%",
      height: 11,
      border: true,
      borderStyle: "rounded",
      borderColor: COLORS.primary,
      backgroundColor: COLORS.surface,
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
      fg: COLORS.bright,
      wrapMode: "word",
    });
    this.modalSelect = new SelectRenderable(renderer, {
      id: "stop-select",
      width: "100%",
      height: 4,
      options: [],
      backgroundColor: COLORS.surface,
      focusedBackgroundColor: COLORS.surface,
      textColor: COLORS.bright,
      selectedBackgroundColor: COLORS.selection,
      selectedTextColor: COLORS.selectedText,
      descriptionColor: COLORS.muted,
      selectedDescriptionColor: COLORS.bright,
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
    this.clearPendingKey();
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

    // Modal intercepts all keys
    if (this.modalBox.visible) {
      if (key.name === "escape") {
        this.closeModal();
      }
      return;
    }

    // Search input intercepts most keys
    if (this.searchInput.focused) {
      if (key.name === "escape" || key.name === "tab") {
        this.listSelect.focus();
        this.render();
      }
      return;
    }

    // Multi-key sequence resolution
    if (this.state.pendingKey === "g" && key.name === "g") {
      this.clearPendingKey();
      this.listSelect.setSelectedIndex(0);
      return;
    }
    if (this.state.pendingKey === "d" && key.name === "d") {
      this.clearPendingKey();
      this.openStopModal(true);
      return;
    }
    if (this.state.pendingKey) {
      this.clearPendingKey();
    }

    // Esc clears marks when list focused
    if (key.name === "escape") {
      if (this.state.markedIds.size > 0) {
        this.state.markedIds.clear();
        this.state.status = "Cleared marks.";
        this.render();
      }
      return;
    }

    // Vim navigation
    if (key.name === "j") {
      this.listSelect.moveDown();
      return;
    }
    if (key.name === "k") {
      this.listSelect.moveUp();
      return;
    }
    if (key.shift && key.name === "g") {
      this.listSelect.setSelectedIndex(this.listSelect.options.length - 1);
      return;
    }
    if (key.name === "g") {
      this.setPendingKey("g");
      return;
    }

    // Vim actions
    if (key.name === "o") {
      await this.openSelected();
      return;
    }
    if (key.name === "d") {
      this.setPendingKey("d");
      return;
    }

    // Panel focus
    if (key.shift && key.name === "h") {
      this.listSelect.focus();
      this.render();
      return;
    }
    if (key.shift && key.name === "l") {
      this.searchInput.focus();
      this.render();
      return;
    }

    // Mark toggle (V = shift+v)
    if (key.shift && key.name === "v") {
      const entry = this.getSelectedEntry();
      if (entry) {
        if (this.state.markedIds.has(entry.id)) {
          this.state.markedIds.delete(entry.id);
        } else {
          this.state.markedIds.add(entry.id);
        }
        this.listSelect.moveDown();
        this.render();
      }
      return;
    }

    // Mark all toggle (%)
    if (key.sequence === "%") {
      const filtered = filterAndSortEntries(
        this.state.entries,
        this.state.selectedId,
        this.state.query,
        this.state.showAll,
        this.state.sortMode,
      );
      if (this.state.markedIds.size > 0) {
        this.state.markedIds.clear();
        this.state.status = "Cleared all marks.";
      } else {
        for (const entry of filtered.entries) {
          this.state.markedIds.add(entry.id);
        }
        this.state.status = `Marked ${filtered.entries.length} entries.`;
      }
      this.render();
      return;
    }

    // Original keybindings (still work)
    if (key.name === "q") {
      this.destroy();
      return;
    }
    if (key.name === "/" || key.name === "tab") {
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
      this.state.status = this.state.showAll ? "Showing all listeners." : "Showing dev servers only.";
      this.render();
      return;
    }
    if (key.name === "s") {
      this.state.sortMode = cycleSortMode(this.state.sortMode);
      this.state.status = `Sort: ${this.state.sortMode}`;
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
      for (const id of this.state.markedIds) {
        if (!entries.some((e) => e.id === id)) {
          this.state.markedIds.delete(id);
        }
      }
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

  private openStopModal(preSelectTerm = false): void {
    // Batch mode: if marks exist, operate on all marked entries
    if (this.state.markedIds.size > 0) {
      const markedEntries = this.state.entries.filter((e) => this.state.markedIds.has(e.id));
      const pids = [...new Set(markedEntries.filter((e) => e.pid !== null).map((e) => e.pid!))];
      if (pids.length === 0) {
        this.state.status = "No marked entries have visible PIDs.";
        this.renderFooter();
        return;
      }

      this.state.modalEntryId = "__batch__";
      this.modalTitleText.content = `Confirm stop for ${pids.length} process${pids.length > 1 ? "es" : ""}`;
      this.modalBodyText.content = `PIDs: ${pids.join(", ")}`;
      this.modalSelect.options = [
        { name: "TERM ALL", description: `Graceful stop for ${pids.length} PIDs`, value: "term-pid" },
        { name: "KILL ALL", description: `Force stop for ${pids.length} PIDs`, value: "kill-pid" },
        { name: "TERM TREES", description: "Graceful stop for PIDs and child processes", value: "term-tree" },
        { name: "KILL TREES", description: "Force stop for PIDs and child processes", value: "kill-tree" },
        { name: "Cancel", description: "Leave all running", value: "cancel" },
      ];
      this.modalSelect.selectedIndex = 0;
      this.modalBox.visible = true;
      this.modalSelect.focus();
      this.render();
      return;
    }

    // Single mode
    const entry = this.getSelectedEntry();
    if (!entry) {
      this.state.status = "No server selected to stop.";
      this.renderFooter();
      return;
    }

    if (entry.pid === null) {
      this.state.status = "No visible PID. Re-run with sudo.";
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
      ? `${entry.processName} also owns ports ${siblingPorts.join(", ")}.`
      : `${entry.processName} serving ${entry.browserUrl}`;
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
    if (this.state.modalEntryId === "__batch__") {
      await this.runBatchStopAction(action);
      return;
    }

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

  private async runBatchStopAction(action: StopAction): Promise<void> {
    const markedEntries = this.state.entries.filter((e) => this.state.markedIds.has(e.id));
    const pids = [...new Set(markedEntries.filter((e) => e.pid !== null).map((e) => e.pid!))];

    this.closeModal();
    this.state.markedIds.clear();
    this.state.status = `Sending ${action} to ${pids.length} processes...`;
    this.renderFooter();

    let successCount = 0;
    for (const pid of pids) {
      const result = await stopProcess(pid, action);
      if (result.ok) successCount++;
    }

    const message = `Sent ${action} to ${successCount}/${pids.length} processes.`;
    await this.refresh(true, message);
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
    const summary = this.buildSummary(filtered.entries.length);
    this.titleText.content = `KLINEX  ${summary}`;
    this.renderList(filtered.entries);
    this.renderDetails();
    this.renderFooter();
  }

  private renderList(entries: ServerEntry[]): void {
    const listWidth = Math.max(56, this.listPanel.width - 2);

    if (entries.length === 0) {
      this.listHeaderText.content = "";
      this.listSelect.visible = false;
      this.emptyArt.visible = true;
      return;
    }

    this.emptyArt.visible = false;
    this.listSelect.visible = true;
    this.listHeaderText.content = formatListHeader(listWidth);

    const options = entries.map((entry) => ({
      name: formatListName(entry, listWidth, this.state.markedIds.has(entry.id)),
      description: "",
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

    const lines: string[] = [
      `${entry.framework ?? "HTTP"} :${entry.port}`,
      "",
      "OVERVIEW",
      `  Target     ${entry.browserUrl}`,
      `  Bind       ${entry.displayHost}:${entry.port}  [${entry.bindHosts.join(", ")}]`,
      `  Probe      ${formatProbe(entry)}`,
      `  Score      ${entry.devScore} ${entry.isLikelyDev ? "dev" : "low"}`,
      "",
      "PROCESS",
      `  PID        ${entry.pid ?? "hidden"}${entry.ppid ? `  PPID ${entry.ppid}` : ""}`,
      `  User       ${entry.user ?? "unknown"}`,
      `  Name       ${entry.processName}`,
      entry.ownerKnown ? "" : "  (hidden owner -- relaunch with sudo)",
      "",
      "COMMAND",
      `  ${entry.command}`,
    ];

    if (entry.notes.length > 0) {
      lines.push("", "MATCHED");
      for (const note of entry.notes) {
        lines.push(`  ${note}`);
      }
    }

    this.detailText.content = lines.filter((line, i, arr) => {
      if (line === "" && i > 0 && arr[i - 1] === "") return false;
      return true;
    }).join("\n");
  }

  private renderFooter(): void {
    const markCount = this.state.markedIds.size;
    const markHint = markCount > 0 ? ` ${markCount} marked` : "";
    this.shortcutsText.content = `[j/k]nav [V]mark [%]all [dd]stop [o]open [/]filter [q]quit${markHint}`;
    const warn = this.state.warning ? ` ! ${this.state.warning}` : "";
    this.statusText.content = `${this.state.status}${warn}`;
  }

  private buildSummary(visibleCount: number): string {
    const mode = this.state.showAll ? "all" : "dev";
    const parts = [
      `${visibleCount}/${this.state.entries.length}`,
      mode,
      this.state.sortMode,
    ];
    if (this.state.query.trim()) {
      parts.push(`"${this.state.query.trim()}"`);
    }
    if (this.state.isRefreshing) {
      parts.push("...");
    }
    return parts.join("  ");
  }

  private getSelectedEntry(): ServerEntry | null {
    if (!this.state.selectedId) {
      return null;
    }

    return this.state.entries.find((entry) => entry.id === this.state.selectedId) ?? null;
  }

  private setPendingKey(key: string): void {
    this.clearPendingKey();
    this.state.pendingKey = key;
    this.state.pendingKeyTimer = setTimeout(() => {
      this.state.pendingKey = null;
      this.state.pendingKeyTimer = null;
    }, 500);
  }

  private clearPendingKey(): void {
    this.state.pendingKey = null;
    if (this.state.pendingKeyTimer) {
      clearTimeout(this.state.pendingKeyTimer);
      this.state.pendingKeyTimer = null;
    }
  }

  private applyResponsiveLayout(): void {
    const narrow = this.renderer.width < 110;
    this.body.flexDirection = narrow ? "column" : "row";
    this.detailPanel.width = narrow ? "100%" : "40%";
    this.detailPanel.height = narrow ? "42%" : "auto";
    this.detailPanel.border = narrow ? false : ["left"];
    this.detailPanel.paddingLeft = narrow ? 0 : 1;
    this.listPanel.height = narrow ? "58%" : "auto";
    this.searchInput.width = Math.max(20, Math.min(40, Math.floor(this.renderer.width * 0.28)));
    this.modalBox.width = narrow ? "86%" : "60%";
    this.modalBox.left = narrow ? "7%" : "20%";
  }
}

function formatListName(entry: ServerEntry, terminalWidth: number, marked: boolean): string {
  const columns = getListColumns(terminalWidth);
  const mark = marked ? "*" : " ";
  const probe = probeLabel(entry);
  const host = truncate(entry.displayHost, columns.hostWidth);
  const framework = truncate(entry.framework ?? "HTTP?", columns.frameworkWidth);
  const processName = truncate(entry.processName, columns.processWidth);
  const pidLabel = entry.pid === null ? "hidden" : String(entry.pid);
  return `${mark}${pad(probe, 5)} ${pad(host, columns.hostWidth)} ${pad(String(entry.port), columns.portWidth)} ${pad(framework, columns.frameworkWidth)} ${pad(processName, columns.processWidth)} ${pad(pidLabel, columns.pidWidth)}`;
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
  return `    ${pad("NET", 5)} ${pad("HOST", columns.hostWidth)} ${pad("PORT", columns.portWidth)} ${pad("APP", columns.frameworkWidth)} ${pad("PROCESS", columns.processWidth)} ${pad("PID", columns.pidWidth)}`;
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
