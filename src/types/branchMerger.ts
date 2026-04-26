/** Represents a single file extracted from a ZIP archive branch folder. */
export interface BranchFile {
  /** Relative path within the branch folder (e.g. "src/utils/helpers.ts") */
  relativePath: string;
  /** Raw text content of the file */
  content: string;
  /** Size in bytes */
  sizeBytes: number;
}

/** A pair of files from main and feature branch that differ. */
export interface DiffPair {
  relativePath: string;
  mainContent: string;
  featureContent: string;
  mainSizeBytes: number;
  featureSizeBytes: number;
  /** Estimated combined token count (rough: 1 token ~ 4 chars) */
  estimatedTokens: number;
}

/** File that exists only in one branch. */
export interface UniqueFile {
  relativePath: string;
  content: string;
  branch: "main" | "feature";
  sizeBytes: number;
}

/** Result of the client-side diff analysis. */
export interface DiffAnalysis {
  /** Files that differ between branches */
  diffPairs: DiffPair[];
  /** Files only in main branch */
  mainOnly: UniqueFile[];
  /** Files only in feature branch */
  featureOnly: UniqueFile[];
  /** Files identical in both branches */
  unchangedCount: number;
  /** Total file count across both branches */
  totalFiles: number;
}

/** Status of a single file merge operation. */
export type MergeFileStatus = "pending" | "merging" | "merged" | "error" | "skipped_too_large";

/** Result of merging a single file pair via AI. */
export interface MergeFileResult {
  relativePath: string;
  status: MergeFileStatus;
  mergedContent?: string;
  error?: string;
  elapsedMs?: number;
  tokenEstimate?: number;
}

/** Request payload sent to the AI merge API route. */
export interface AiMergeRequest {
  relativePath: string;
  mainContent: string;
  featureContent: string;
}

/** Response from the AI merge API route. */
export interface AiMergeResponse {
  mergedContent: string;
  model: string;
  tokensUsed?: number;
  error?: string;
}

/** Overall merge session state. */
export interface MergeSession {
  diffAnalysis: DiffAnalysis | null;
  mergeResults: MergeFileResult[];
  status: "idle" | "analyzing" | "merging" | "complete" | "error";
  currentFile?: string;
  progress: number;
  totalToMerge: number;
}

/** Max combined token estimate before we skip a file pair. */
export const MAX_TOKENS_PER_FILE = 28000;

/** Rough chars-per-token ratio for estimation. */
export const CHARS_PER_TOKEN = 4;
