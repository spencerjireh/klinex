import { expect, test } from "bun:test";

import { KlinexApp } from "./app.ts";

interface KeyLike {
  name: string;
  ctrl: boolean;
  shift: boolean;
  sequence?: string;
}

interface FakeApp {
  modalBox: { visible: boolean };
  searchInput: { focused: boolean; focus: () => void };
  state: {
    pendingKey: string | null;
    markedIds: Set<string>;
    showAll: boolean;
    sortMode: "relevance";
    selectedId: string | null;
    query: string;
    entries: unknown[];
    status: string;
  };
  listSelect: {
    options: unknown[];
    moveDown: () => void;
    moveUp: () => void;
    setSelectedIndex: (_index: number) => void;
    focus: () => void;
  };
  render: () => void;
  renderFooter: () => void;
  clearPendingKey: () => void;
  setPendingKey: (_key: string) => void;
  openSelected: () => Promise<void>;
  refresh: (_forceProbe: boolean, _successMessage?: string) => Promise<void>;
  openStopModal: (_preSelectTerm?: boolean) => void;
  destroy: () => void;
  getSelectedEntry: () => null;
}

const handleKeyPress = KlinexApp.prototype["handleKeyPress"] as (
  this: FakeApp,
  key: KeyLike,
) => Promise<void>;

function createFakeApp(): {
  app: FakeApp;
  moveDownCalls: number;
  moveUpCalls: number;
} {
  let moveDownCalls = 0;
  let moveUpCalls = 0;

  return {
    app: {
      modalBox: { visible: false },
      searchInput: { focused: false, focus: () => undefined },
      state: {
        pendingKey: null,
        markedIds: new Set(),
        showAll: false,
        sortMode: "relevance",
        selectedId: null,
        query: "",
        entries: [],
        status: "",
      },
      listSelect: {
        options: [],
        moveDown: () => {
          moveDownCalls += 1;
        },
        moveUp: () => {
          moveUpCalls += 1;
        },
        setSelectedIndex: () => undefined,
        focus: () => undefined,
      },
      render: () => undefined,
      renderFooter: () => undefined,
      clearPendingKey: () => undefined,
      setPendingKey: () => undefined,
      openSelected: async () => undefined,
      refresh: async () => undefined,
      openStopModal: () => undefined,
      destroy: () => undefined,
      getSelectedEntry: () => null,
    },
    get moveDownCalls() {
      return moveDownCalls;
    },
    get moveUpCalls() {
      return moveUpCalls;
    },
  };
}

test("handleKeyPress leaves j navigation to the focused select", async () => {
  const fake = createFakeApp();

  await handleKeyPress.call(fake.app, {
    name: "j",
    ctrl: false,
    shift: false,
    sequence: "j",
  });

  expect(fake.moveDownCalls).toBe(0);
  expect(fake.moveUpCalls).toBe(0);
});

test("handleKeyPress leaves k navigation to the focused select", async () => {
  const fake = createFakeApp();

  await handleKeyPress.call(fake.app, {
    name: "k",
    ctrl: false,
    shift: false,
    sequence: "k",
  });

  expect(fake.moveDownCalls).toBe(0);
  expect(fake.moveUpCalls).toBe(0);
});
