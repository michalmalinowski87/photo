/**
 * Custom Uppy plugin for parallel thumbnail generation using Web Workers
 * Processes multiple thumbnails concurrently for better performance
 */

import { BasePlugin, type UppyFile } from "@uppy/core";
import type Uppy from "@uppy/core";

interface ParallelThumbnailOptions {
  thumbnailWidth?: number;
  thumbnailType?: string;
  maxWorkers?: number; // Number of Web Workers to use (default: 4)
  workerPath?: string; // Path to worker file
}

interface QueuedFile {
  fileId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  file: UppyFile<Record<string, any>, Record<string, never>>;
  resolve: (thumbnail: string) => void;
  reject: (error: Error) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class ParallelThumbnailGenerator extends BasePlugin<any, any, any> {
  static VERSION = "1.0.0";

  private options: Required<ParallelThumbnailOptions>;

  private workers: Worker[] = [];
  private workerQueue: QueuedFile[] = [];
  private activeTasks = new Map<string, QueuedFile>();
  private workerReady = new Set<number>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(uppy: Uppy, opts: ParallelThumbnailOptions) {
    super(uppy, opts);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    this.id = "parallel-thumbnail-generator";
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    this.type = "thumbnail";
    
    // Adaptive worker count based on CPU cores (conservative for slower PCs)
    // Use navigator.hardwareConcurrency to detect CPU cores
    // Conservative approach: 4 workers for <=4 cores, 6 workers for >4 cores
    // This ensures good performance on modern PCs while not overwhelming slower ones
    const cpuCores = typeof navigator !== 'undefined' && navigator.hardwareConcurrency 
      ? navigator.hardwareConcurrency 
      : 4; // Default to 4 if not available
    const adaptiveWorkerCount = cpuCores > 4 ? 6 : 4;
    
    this.options = {
      thumbnailWidth: opts.thumbnailWidth ?? 250,
      thumbnailType: opts.thumbnailType ?? "image/jpeg",
      maxWorkers: opts.maxWorkers ?? adaptiveWorkerCount, // Use adaptive count unless explicitly set
      workerPath: opts.workerPath ?? "/thumbnail-worker.js",
    };
  }

  override install(): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    this.uppy.on("file-added", this.handleFileAdded.bind(this));
  }

  override uninstall(): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    this.uppy.off("file-added", this.handleFileAdded.bind(this));
    this.cleanup();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleFileAdded(file: UppyFile<Record<string, any>, Record<string, never>>): void {
    // Only process image files
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const fileType: string | undefined = file.type;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    if (!fileType?.startsWith("image/")) {
      return;
    }

    // Skip if thumbnail already exists (from other plugin or already processed)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (file.preview) {
      return;
    }

    // Queue file for thumbnail generation
    void this.queueFile(file);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private queueFile(file: UppyFile<Record<string, any>, Record<string, never>>): Promise<void> {
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const fileId: string = file.id;
      const queuedFile: QueuedFile = {
        fileId,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        file,
        resolve: (thumbnail: string) => {
          // Update Uppy file with thumbnail
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          const uppyFile = this.uppy.getFile(fileId);
          if (uppyFile) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            this.uppy.setFileState(fileId, {
              preview: thumbnail,
            });
            
            // Emit thumbnail:generated event (for compatibility with other plugins like ThumbnailUploadPlugin)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            (this.uppy.emit as any)("thumbnail:generated", uppyFile, thumbnail);
          }
          resolve();
        },
        reject,
      };

      this.workerQueue.push(queuedFile);
      void this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    // Initialize workers if needed
    if (this.workers.length === 0) {
      this.initializeWorkers();
    }

    // Process queue while workers are available
    while (this.workerQueue.length > 0 && this.workerReady.size > 0) {
      const queuedFile = this.workerQueue.shift();
      if (!queuedFile) break;

      // Find available worker
      const workerIndex = Array.from(this.workerReady)[0];
      const worker = this.workers[workerIndex];

      if (!worker) continue;

      // Mark worker as busy
      this.workerReady.delete(workerIndex);
      this.activeTasks.set(queuedFile.fileId, queuedFile);

        // Read file data
        try {
          const fileData = await this.readFileData(queuedFile.file);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          const fileName: string = (queuedFile.file.name as string | undefined) ?? "";
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          const fileType: string = (queuedFile.file.type as string | undefined) ?? "image/jpeg";

          // Send to worker with file type for better quality preservation
          worker.postMessage({
            command: "generate",
            fileId: queuedFile.fileId,
            fileData,
            fileName,
            fileType,
          });
        } catch (error) {
          this.workerReady.add(workerIndex);
          this.activeTasks.delete(queuedFile.fileId);
          queuedFile.reject(
            error instanceof Error ? error : new Error(String(error))
          );
        }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async readFileData(file: UppyFile<Record<string, any>, Record<string, never>>): Promise<ArrayBuffer> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const fileData: File | Blob | ArrayBuffer | undefined = file.data as
      | File
      | Blob
      | ArrayBuffer
      | undefined;
    if (fileData instanceof File) {
      return await fileData.arrayBuffer();
    } else if (fileData instanceof Blob) {
      return await fileData.arrayBuffer();
    } else if (fileData instanceof ArrayBuffer) {
      return fileData;
    } else {
      throw new Error("Unsupported file data type");
    }
  }

  private initializeWorkers(): void {
    // Check if Web Workers are supported
    if (typeof Worker === "undefined") {
      console.warn("Web Workers not supported, falling back to sequential processing");
      return;
    }

    const workerCount = this.options.maxWorkers;

    for (let i = 0; i < workerCount; i++) {
      try {
        const worker = new Worker(this.options.workerPath);
        
        worker.onmessage = (event) => {
          const eventData = event.data as {
            fileId: string;
            success: boolean;
            thumbnail?: string;
            error?: string;
          };
          const { fileId, success, thumbnail, error } = eventData;
          const task = this.activeTasks.get(fileId);

          if (!task) return;

          // Find which worker this is
          const workerIndex = this.workers.indexOf(worker);

          if (success && thumbnail) {
            task.resolve(thumbnail);
          } else {
            task.reject(new Error(error ?? "Thumbnail generation failed"));
          }

          // Mark worker as ready and process next item
          this.activeTasks.delete(fileId);
          this.workerReady.add(workerIndex);
          void this.processQueue();
        };

        worker.onerror = (workerError) => {
          console.error("Worker error:", workerError);
          const workerIndex = this.workers.indexOf(worker);
          this.workerReady.delete(workerIndex);
          
          // Retry with new worker if possible
          if (this.workers.length < this.options.maxWorkers) {
            void this.initializeWorkers();
          }
        };

        this.workers.push(worker);
        this.workerReady.add(i);
      } catch (error) {
        console.error(`Failed to initialize worker ${i}:`, error);
      }
    }
  }

  private cleanup(): void {
    // Terminate all workers
    this.workers.forEach((worker) => {
      worker.terminate();
    });
    this.workers = [];
    this.workerReady.clear();
    this.activeTasks.clear();
    this.workerQueue = [];
  }
}

export default ParallelThumbnailGenerator;
