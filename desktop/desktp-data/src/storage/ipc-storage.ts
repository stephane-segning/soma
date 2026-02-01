export type DbStorageBridge = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
  keys: () => string[];
};

export function createIpcStorage(bridge: DbStorageBridge): Storage {
  const getKeys = () => bridge.keys();

  return {
    get length() {
      return getKeys().length;
    },
    clear() {
      bridge.clear();
    },
    getItem(key: string) {
      return bridge.getItem(key);
    },
    key(index: number) {
      return getKeys()[index] ?? null;
    },
    removeItem(key: string) {
      bridge.removeItem(key);
    },
    setItem(key: string, value: string) {
      bridge.setItem(key, value);
    }
  };
}
