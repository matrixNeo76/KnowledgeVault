import { ResourceItem, RawFileItem } from "../types";
import { loadResourcesFromIndexedDB } from "./indexedDb";
import { loadFromServerFilesystem, saveMultiLayerResources } from "./cacheManager";
import { parseDate } from "./dateUtils";

export interface StorageSourceDetail {
  sourceName: string;
  count: number;
  description: string;
  items: ResourceItem[];
}

export interface DeepRecoveryScanReport {
  totalUniqueResources: number;
  uniqueResources: ResourceItem[];
  sources: StorageSourceDetail[];
  totalRawFilesFound: number;
  rawFiles: RawFileItem[];
  hasRecoverableData: boolean;
  scanTimestamp: number;
  currentVaultCount: number;
}

/**
 * Performs a deep scan across all available client-side and server-side storage layers:
 * 1. Every key in window.localStorage (even orphaned or previous account keys)
 * 2. window.sessionStorage
 * 3. Browser IndexedDB (KnowledgeVaultDB)
 * 4. Server Filesystem (/api/vault/backup and snapshots)
 */
export async function performDeepRecoveryScan(currentVaultResources: ResourceItem[]): Promise<DeepRecoveryScanReport> {
  const sources: StorageSourceDetail[] = [];
  const rawFilesAccumulator: RawFileItem[] = [];
  const allFoundResources: ResourceItem[] = [];

  // Helper to normalize and validate resources
  const normalizeItems = (items: any[], sourceKey: string): ResourceItem[] => {
    if (!Array.isArray(items)) return [];
    const valid: ResourceItem[] = [];
    items.forEach((item, index) => {
      if (item && typeof item === "object" && (item.title || item.type || item.url || item.metadata)) {
        const title = item.title || `Risorsa senza titolo #${index + 1}`;
        const type = item.type || "knowledge";
        const createdAt = parseDate(item.createdAt) || parseDate(item.updatedAt) || new Date();
        const updatedAt = parseDate(item.updatedAt) || createdAt;
        valid.push({
          ...item,
          id: item.id || `recovered-${sourceKey}-${index}-${Date.now()}`,
          title,
          type,
          summary: item.summary || "",
          tags: Array.isArray(item.tags) ? item.tags : [],
          createdAt,
          updatedAt,
        });
      }
    });
    return valid;
  };

  // 1. SCAN ALL LOCALSTORAGE KEYS (Exhaustive Scan)
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const storageLength = localStorage.length;
      for (let i = 0; i < storageLength; i++) {
        const key = localStorage.key(i);
        if (!key) continue;

        try {
          const rawVal = localStorage.getItem(key);
          if (rawVal && (rawVal.startsWith("[") || rawVal.startsWith("{"))) {
            const parsed = JSON.parse(rawVal);
            let itemsToProcess: any[] = [];
            if (Array.isArray(parsed)) {
              itemsToProcess = parsed;
            } else if (parsed && Array.isArray(parsed.resources)) {
              itemsToProcess = parsed.resources;
            } else if (parsed && Array.isArray(parsed.items)) {
              itemsToProcess = parsed.items;
            } else if (parsed && typeof parsed === "object" && parsed.title && (parsed.type || parsed.metadata)) {
              itemsToProcess = [parsed];
            }

            const normalized = normalizeItems(itemsToProcess, key);
            if (normalized.length > 0) {
              sources.push({
                sourceName: `LocalStorage: ${key}`,
                count: normalized.length,
                description: `Dati trovati nella chiave browser '${key}'`,
                items: normalized,
              });
              allFoundResources.push(...normalized);
            }

            // Also check for raw files in this key
            let rawFilesToProcess: any[] = [];
            if (Array.isArray(parsed) && parsed.some((p: any) => p && p.fileName)) {
              rawFilesToProcess = parsed;
            } else if (parsed && Array.isArray(parsed.rawFiles)) {
              rawFilesToProcess = parsed.rawFiles;
            }
            rawFilesToProcess.forEach((rf: any) => {
              if (rf && rf.fileName) {
                rawFilesAccumulator.push({
                  ...rf,
                  createdAt: parseDate(rf.createdAt) || new Date(),
                });
              }
            });
          }
        } catch {
          // Ignore non-json keys
        }
      }
    }
  } catch (err) {
    console.warn("[RecoveryManager] Error scanning localStorage:", err);
  }

  // 2. SCAN ALL SESSIONSTORAGE KEYS
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (!key) continue;
        try {
          const rawVal = sessionStorage.getItem(key);
          if (rawVal && (rawVal.startsWith("[") || rawVal.startsWith("{"))) {
            const parsed = JSON.parse(rawVal);
            let itemsToProcess: any[] = [];
            if (Array.isArray(parsed)) {
              itemsToProcess = parsed;
            } else if (parsed && Array.isArray(parsed.resources)) {
              itemsToProcess = parsed.resources;
            } else if (parsed && Array.isArray(parsed.items)) {
              itemsToProcess = parsed.items;
            }
            const normalized = normalizeItems(itemsToProcess, `session-${key}`);
            if (normalized.length > 0) {
              sources.push({
                sourceName: `SessionStorage: ${key}`,
                count: normalized.length,
                description: `Dati di sessione nella chiave '${key}'`,
                items: normalized,
              });
              allFoundResources.push(...normalized);
            }
          }
        } catch {}
      }
    }
  } catch (err) {
    console.warn("[RecoveryManager] Error scanning sessionStorage:", err);
  }

  // 3. SCAN INDEXEDDB (Both KnowledgeVaultDB and any existing DBs)
  try {
    // Standard KnowledgeVaultDB
    const idbResources = await loadResourcesFromIndexedDB();
    if (idbResources && idbResources.length > 0) {
      sources.push({
        sourceName: "Browser IndexedDB (KnowledgeVaultDB)",
        count: idbResources.length,
        description: "Database locale strutturato IndexedDB del browser",
        items: idbResources,
      });
      allFoundResources.push(...idbResources);
    }

    // Extended scan: if browser supports indexedDB.databases(), scan any other databases on this origin
    if (typeof window !== "undefined" && window.indexedDB && (window.indexedDB as any).databases) {
      try {
        const dbs = await (window.indexedDB as any).databases();
        for (const dbInfo of dbs) {
          if (dbInfo && dbInfo.name && dbInfo.name !== "KnowledgeVaultDB") {
            try {
              const req = indexedDB.open(dbInfo.name);
              await new Promise<void>((resolve) => {
                req.onsuccess = () => {
                  try {
                    const otherDb = req.result;
                    const storeNames = Array.from(otherDb.objectStoreNames);
                    for (const storeName of storeNames) {
                      try {
                        const tx = otherDb.transaction(storeName, "readonly");
                        const store = tx.objectStore(storeName);
                        const getAllReq = store.getAll();
                        getAllReq.onsuccess = () => {
                          const results = getAllReq.result || [];
                          const normalized = normalizeItems(results, `${dbInfo.name}.${storeName}`);
                          if (normalized.length > 0) {
                            sources.push({
                              sourceName: `IndexedDB: ${dbInfo.name} / ${storeName}`,
                              count: normalized.length,
                              description: `Record trovati in IndexedDB alternativo`,
                              items: normalized,
                            });
                            allFoundResources.push(...normalized);
                          }
                        };
                      } catch {}
                    }
                    otherDb.close();
                  } catch {}
                  resolve();
                };
                req.onerror = () => resolve();
              });
            } catch {}
          }
        }
      } catch {}
    }
  } catch (err) {
    console.warn("[RecoveryManager] Error scanning IndexedDB:", err);
  }

  // 4. SCAN SERVER BACKUP FILESYSTEM
  try {
    const serverBackup = await loadFromServerFilesystem();
    if (serverBackup && serverBackup.resources && serverBackup.resources.length > 0) {
      sources.push({
        sourceName: "Backup Server Filesystem (data/vault-backup.json)",
        count: serverBackup.resources.length,
        description: `Backup persistente su file system server (${serverBackup.savedAt || "recente"})`,
        items: serverBackup.resources,
      });
      allFoundResources.push(...serverBackup.resources);
      if (serverBackup.rawFiles && serverBackup.rawFiles.length > 0) {
        rawFilesAccumulator.push(...serverBackup.rawFiles);
      }
    }
  } catch (err) {
    console.warn("[RecoveryManager] Error scanning server filesystem:", err);
  }

  // 5. SCAN SERVER SNAPSHOTS IF AVAILABLE
  try {
    const snapshotsRes = await fetch("/api/vault/snapshots");
    if (snapshotsRes.ok) {
      const snapData = await snapshotsRes.json();
      if (Array.isArray(snapData.snapshots) && snapData.snapshots.length > 0) {
        for (const snap of snapData.snapshots) {
          if (snap.filename) {
            try {
              const resFile = await fetch(`/api/vault/snapshot-detail?filename=${encodeURIComponent(snap.filename)}`);
              if (resFile.ok) {
                const jsonDetail = await resFile.json();
                if (Array.isArray(jsonDetail.resources) && jsonDetail.resources.length > 0) {
                  const normalized = normalizeItems(jsonDetail.resources, snap.filename);
                  sources.push({
                    sourceName: `Snapshot Storico: ${snap.filename}`,
                    count: normalized.length,
                    description: `Istantanea server salvata il ${new Date(snap.timestamp).toLocaleString("it-IT")}`,
                    items: normalized,
                  });
                  allFoundResources.push(...normalized);
                }
              }
            } catch {}
          }
        }
      }
    }
  } catch {}

  // 6. DEDUPLICATE ALL FOUND RESOURCES
  // We deduplicate by: 1) id, 2) normalized title, 3) URL if present
  const uniqueMap = new Map<string, ResourceItem>();

  allFoundResources.forEach((item) => {
    // Determine deduplication key
    const titleKey = item.title.trim().toLowerCase();
    const urlKey = item.url ? item.url.trim().toLowerCase() : "";
    const primaryKey = item.id || `${titleKey}_${urlKey}`;

    if (!uniqueMap.has(primaryKey)) {
      // Also check if any existing item has identical title
      let foundExisting = false;
      for (const [_, existing] of uniqueMap.entries()) {
        if (existing.title.trim().toLowerCase() === titleKey && titleKey.length > 3) {
          foundExisting = true;
          // Merge metadata / tags if new item has more details
          if ((item.tags?.length || 0) > (existing.tags?.length || 0)) {
            existing.tags = Array.from(new Set([...(existing.tags || []), ...(item.tags || [])]));
          }
          if (item.metadata && (!existing.metadata || Object.keys(item.metadata).length > Object.keys(existing.metadata).length)) {
            existing.metadata = { ...existing.metadata, ...item.metadata };
          }
          break;
        }
      }
      if (!foundExisting) {
        uniqueMap.set(primaryKey, item);
      }
    }
  });

  const uniqueResources = Array.from(uniqueMap.values());
  const hasRecoverableData = uniqueResources.length > currentVaultResources.length;

  return {
    totalUniqueResources: uniqueResources.length,
    uniqueResources,
    sources,
    totalRawFilesFound: rawFilesAccumulator.length,
    rawFiles: rawFilesAccumulator,
    hasRecoverableData,
    scanTimestamp: Date.now(),
    currentVaultCount: currentVaultResources.length,
  };
}

/**
 * Restores recovered resources into the Vault and persists to all storage layers.
 */
export async function restoreRecoveredResources(
  recoveredResources: ResourceItem[],
  existingResources: ResourceItem[],
  currentUserId?: string,
  rawFiles?: RawFileItem[]
): Promise<{
  mergedCount: number;
  addedCount: number;
  restoredResources: ResourceItem[];
}> {
  const mergedMap = new Map<string, ResourceItem>();

  // Add existing items first
  existingResources.forEach((item) => {
    const normTitle = item.title.trim().toLowerCase();
    mergedMap.set(normTitle, item);
  });

  let addedCount = 0;

  // Add recovered items
  recoveredResources.forEach((item) => {
    const normTitle = item.title.trim().toLowerCase();
    if (!mergedMap.has(normTitle)) {
      mergedMap.set(normTitle, {
        ...item,
        userId: currentUserId || item.userId || "vault-user",
        createdAt: item.createdAt instanceof Date ? item.createdAt : new Date(item.createdAt || Date.now()),
        updatedAt: new Date(),
      });
      addedCount++;
    } else {
      // Merge tags and metadata
      const existing = mergedMap.get(normTitle)!;
      if (item.tags && item.tags.length > 0) {
        existing.tags = Array.from(new Set([...(existing.tags || []), ...item.tags]));
      }
      if (item.isFavorite && !existing.isFavorite) {
        existing.isFavorite = true;
      }
      if (item.metadata) {
        existing.metadata = { ...existing.metadata, ...item.metadata };
      }
    }
  });

  const restoredResources = Array.from(mergedMap.values());

  // Sort by createdAt descending
  restoredResources.sort((a, b) => {
    const tA = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
    const tB = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
    return tB - tA;
  });

  // Save to all layers
  await saveMultiLayerResources(restoredResources, rawFiles, currentUserId);

  return {
    mergedCount: restoredResources.length,
    addedCount,
    restoredResources,
  };
}

/**
 * Exports resources directly as a downloadable JSON file in the browser.
 */
export function downloadBackupJSON(resources: ResourceItem[], rawFiles?: RawFileItem[]): void {
  const payload = {
    vaultVersion: "0.2",
    exportedAt: new Date().toISOString(),
    totalResources: resources.length,
    totalRawFiles: rawFiles?.length || 0,
    resources,
    rawFiles: rawFiles || [],
  };

  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
  const downloadAnchor = document.createElement("a");
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `knowledge-vault-backup-${new Date().toISOString().slice(0, 10)}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}
