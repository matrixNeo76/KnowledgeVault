import { ResourceItem } from "../types";
import { parseDate, getTimestampMillis } from "./dateUtils";

export type ConflictStatus =
  | "local_newer"
  | "remote_newer"
  | "identical"
  | "local_only"
  | "remote_only";

export type ResolutionChoice = "use_local" | "use_remote" | "merged";

export interface ConflictItem {
  id: string;
  title: string;
  type: ResourceItem["type"];
  domain?: string;
  localResource?: ResourceItem;
  remoteResource?: ResourceItem;
  localUpdatedAt: Date | null;
  remoteUpdatedAt: Date | null;
  localTimestampMs: number;
  remoteTimestampMs: number;
  status: ConflictStatus;
  resolution: ResolutionChoice;
  resolvedResource: ResourceItem;
  diffSummary?: string;
}

export interface ConflictAnalysisResult {
  hasConflicts: boolean;
  totalLocal: number;
  totalRemote: number;
  totalMerged: number;
  localOnlyCount: number;
  remoteOnlyCount: number;
  localNewerCount: number;
  remoteNewerCount: number;
  identicalCount: number;
  items: ConflictItem[];
  mergedResources: ResourceItem[];
  itemsToUploadToFirestore: ResourceItem[];
}

/**
 * Compares local resources with remote Firestore resources
 * based on the updatedAt (or createdAt) timestamp and content integrity.
 */
export function analyzeResourceConflicts(
  localItems: ResourceItem[],
  remoteItems: ResourceItem[]
): ConflictAnalysisResult {
  const localMap = new Map<string, ResourceItem>();
  const remoteMap = new Map<string, ResourceItem>();

  // Helper function to create a canonical resource signature
  const getResourceSignature = (item: ResourceItem): string => {
    if (item.url && item.url.trim().length > 3) {
      return `url:${item.url.trim().toLowerCase().replace(/\/$/, "")}`;
    }
    return `title:${item.type}:${item.title.trim().toLowerCase()}`;
  };

  // Build remote signature index to detect when a local-ID document is actually already on remote
  const remoteSigMap = new Map<string, ResourceItem>();
  remoteItems.forEach((item) => {
    if (item.id) {
      remoteMap.set(item.id, item);
      remoteSigMap.set(getResourceSignature(item), item);
    }
  });

  // Map local items, consolidating any temp local IDs if a remote match already exists
  localItems.forEach((item) => {
    if (!item.id) return;

    // Check if this is a temp local ID that matches a remote resource by signature
    const isTempId = item.id.startsWith("local-") || item.id.startsWith("conv-") || item.id.startsWith("seed-");
    if (isTempId) {
      const sig = getResourceSignature(item);
      const matchedRemote = remoteSigMap.get(sig);
      if (matchedRemote) {
        // Associate this local item with the remote ID instead of keeping a split identity
        localMap.set(matchedRemote.id, {
          ...item,
          id: matchedRemote.id,
        });
        return;
      }
    }

    localMap.set(item.id, item);
  });

  const allIds = new Set<string>([...localMap.keys(), ...remoteMap.keys()]);
  const conflictItems: ConflictItem[] = [];
  const mergedMap = new Map<string, ResourceItem>();
  const itemsToUploadToFirestore: ResourceItem[] = [];

  let localOnlyCount = 0;
  let remoteOnlyCount = 0;
  let localNewerCount = 0;
  let remoteNewerCount = 0;
  let identicalCount = 0;

  allIds.forEach((id) => {
    const local = localMap.get(id);
    const remote = remoteMap.get(id);

    // Case 1: Exists only in Local (created while offline / quota exceeded)
    if (local && !remote) {
      localOnlyCount++;
      const localUpdated = parseDate(local.updatedAt) || parseDate(local.createdAt) || new Date();
      const localMs = getTimestampMillis(localUpdated);

      conflictItems.push({
        id,
        title: local.title || "Documento senza titolo",
        type: local.type,
        domain: local.metadata?.domain,
        localResource: local,
        remoteResource: undefined,
        localUpdatedAt: localUpdated,
        remoteUpdatedAt: null,
        localTimestampMs: localMs,
        remoteTimestampMs: 0,
        status: "local_only",
        resolution: "use_local",
        resolvedResource: local,
        diffSummary: "Creato in locale durante il periodo offline",
      });

      mergedMap.set(id, local);
      itemsToUploadToFirestore.push(local);
      return;
    }

    // Case 2: Exists only in Remote (created on Firestore / cloud)
    if (!local && remote) {
      remoteOnlyCount++;
      const remoteUpdated = parseDate(remote.updatedAt) || parseDate(remote.createdAt) || new Date();
      const remoteMs = getTimestampMillis(remoteUpdated);

      conflictItems.push({
        id,
        title: remote.title || "Documento senza titolo",
        type: remote.type,
        domain: remote.metadata?.domain,
        localResource: undefined,
        remoteResource: remote,
        localUpdatedAt: null,
        remoteUpdatedAt: remoteUpdated,
        localTimestampMs: 0,
        remoteTimestampMs: remoteMs,
        status: "remote_only",
        resolution: "use_remote",
        resolvedResource: remote,
        diffSummary: "Presente su Firestore (non ancora scaricato in locale)",
      });

      mergedMap.set(id, remote);
      return;
    }

    // Case 3: Exists in both Local and Remote
    if (local && remote) {
      const localUpdated = parseDate(local.updatedAt) || parseDate(local.createdAt) || new Date();
      const remoteUpdated = parseDate(remote.updatedAt) || parseDate(remote.createdAt) || new Date();

      const localMs = getTimestampMillis(localUpdated);
      const remoteMs = getTimestampMillis(remoteUpdated);

      // Check if fields or timestamps differ
      const timeDiff = Math.abs(localMs - remoteMs);
      const titlesMatch = local.title === remote.title;
      const summariesMatch = local.summary === remote.summary;
      const tagsMatch = JSON.stringify(local.tags || []) === JSON.stringify(remote.tags || []);
      const contentMatch =
        (local.metadata?.markdownContent || "") === (remote.metadata?.markdownContent || "");

      const isContentIdentical = titlesMatch && summariesMatch && tagsMatch && contentMatch;

      if (isContentIdentical && timeDiff < 2000) {
        identicalCount++;
        conflictItems.push({
          id,
          title: local.title || "Documento",
          type: local.type,
          domain: local.metadata?.domain,
          localResource: local,
          remoteResource: remote,
          localUpdatedAt: localUpdated,
          remoteUpdatedAt: remoteUpdated,
          localTimestampMs: localMs,
          remoteTimestampMs: remoteMs,
          status: "identical",
          resolution: "use_remote",
          resolvedResource: remote,
          diffSummary: "Identico su entrambi i lati",
        });
        mergedMap.set(id, remote);
        return;
      }

      // Local is newer than Remote
      if (localMs > remoteMs) {
        localNewerCount++;
        conflictItems.push({
          id,
          title: local.title || remote.title || "Documento",
          type: local.type,
          domain: local.metadata?.domain,
          localResource: local,
          remoteResource: remote,
          localUpdatedAt: localUpdated,
          remoteUpdatedAt: remoteUpdated,
          localTimestampMs: localMs,
          remoteTimestampMs: remoteMs,
          status: "local_newer",
          resolution: "use_local",
          resolvedResource: local,
          diffSummary: `Modifica locale più recente di ${formatDurationDiff(localMs - remoteMs)}`,
        });
        mergedMap.set(id, local);
        itemsToUploadToFirestore.push(local);
        return;
      }

      // Remote is newer than Local
      if (remoteMs > localMs) {
        remoteNewerCount++;
        conflictItems.push({
          id,
          title: remote.title || local.title || "Documento",
          type: remote.type,
          domain: remote.metadata?.domain,
          localResource: local,
          remoteResource: remote,
          localUpdatedAt: localUpdated,
          remoteUpdatedAt: remoteUpdated,
          localTimestampMs: localMs,
          remoteTimestampMs: remoteMs,
          status: "remote_newer",
          resolution: "use_remote",
          resolvedResource: remote,
          diffSummary: `Versione Firestore più recente di ${formatDurationDiff(remoteMs - localMs)}`,
        });
        mergedMap.set(id, remote);
        return;
      }

      // Exact timestamp tie but content differs -> prefer local user's working draft
      localNewerCount++;
      conflictItems.push({
        id,
        title: local.title || remote.title || "Documento",
        type: local.type,
        domain: local.metadata?.domain,
        localResource: local,
        remoteResource: remote,
        localUpdatedAt: localUpdated,
        remoteUpdatedAt: remoteUpdated,
        localTimestampMs: localMs,
        remoteTimestampMs: remoteMs,
        status: "local_newer",
        resolution: "use_local",
        resolvedResource: local,
        diffSummary: "Contenuto differente a parità di data (preferita bozza locale)",
      });
      mergedMap.set(id, local);
      itemsToUploadToFirestore.push(local);
    }
  });

  // Sort merged resources by createdAt descending
  const mergedResources = Array.from(mergedMap.values()).sort((a, b) => {
    const timeA = getTimestampMillis(a.createdAt);
    const timeB = getTimestampMillis(b.createdAt);
    return timeB - timeA;
  });

  const hasConflicts = localOnlyCount > 0 || localNewerCount > 0 || remoteNewerCount > 0;

  return {
    hasConflicts,
    totalLocal: localItems.length,
    totalRemote: remoteItems.length,
    totalMerged: mergedResources.length,
    localOnlyCount,
    remoteOnlyCount,
    localNewerCount,
    remoteNewerCount,
    identicalCount,
    items: conflictItems,
    mergedResources,
    itemsToUploadToFirestore,
  };
}

function formatDurationDiff(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return `${hr}h ${remMin}m`;
}
