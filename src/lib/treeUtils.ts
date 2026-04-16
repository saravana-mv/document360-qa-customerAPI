/** Shared tree utility functions for folder operations */

const NEWLY_ADDED = "NEWLY-ADDED";

/** Get the parent folder path ("Articles/CRUD" → "Articles", "Articles" → "") */
export function parentOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

/** Count folder depth (0 for root-level, 1 for "Articles", 2 for "Articles/CRUD") */
export function depthOf(path: string): number {
  if (!path) return 0;
  return path.split("/").length;
}

/** Validate whether a drag target is valid */
export function canDrop(
  _dragFlowPath: string,
  targetFolder: string,
  currentFolder: string,
): boolean {
  // Can't drop into same folder
  if (targetFolder === currentFolder) return false;
  return true;
}

/** Check if a folder name is the reserved NEWLY-ADDED folder */
export function isNewlyAdded(folderName: string): boolean {
  // Check the last segment of the path
  const segments = folderName.split("/");
  return segments[segments.length - 1] === NEWLY_ADDED;
}

/** The reserved default folder name */
export { NEWLY_ADDED };
