/**
 * Queue Management System - Phase 1
 * Manages three-pillar AI queues with status tracking
 */

import { IssueType, PriorityLevel, ComplexityLevel, QueuedIssue, GitHubIssue } from './label-router';

export interface QueueStatus {
  feature: QueueStats;
  content: QueueStats;
  e2e: QueueStats;
  total: QueueStats;
}

export interface QueueStats {
  total: number;
  ready: number;
  processing: number;
  blocked: number;
  completed: number;
  failed: number;
}

export interface ProcessingItem {
  issue: QueuedIssue;
  startedAt: string;
  modelUsed: string;
  progress?: string;
}

export interface CompletedItem {
  issue: QueuedIssue;
  completedAt: string;
  processingTime: number; // milliseconds
  modelUsed: string;
  solution?: string;
  outputSize?: number;
}

export interface FailedItem {
  issue: QueuedIssue;
  failedAt: string;
  error: string;
  retryCount: number;
  modelUsed?: string;
}

export interface QueueState {
  // Active queues by type
  queues: {
    feature: QueuedIssue[];
    content: QueuedIssue[];
    e2e: QueuedIssue[];
  };
  
  // Processing state
  currentProcessing: {
    feature: ProcessingItem | null;
    content: ProcessingItem | null;
    e2e: ProcessingItem | null;
  };
  
  // Completed items
  completed: CompletedItem[];
  
  // Failed items
  failed: FailedItem[];
  
  // Blocked issues (need attention)
  blocked: QueuedIssue[];
  
  // Issues needing clarification
  needsClarification: QueuedIssue[];
  
  // Metadata
  lastUpdated: string;
  stats: QueueStatus;
}

export class QueueManager {
  private state: QueueState;

  constructor() {
    this.state = this.getInitialState();
  }

  /**
   * Initialize empty queue state
   */
  private getInitialState(): QueueState {
    return {
      queues: {
        feature: [],
        content: [],
        e2e: []
      },
      currentProcessing: {
        feature: null,
        content: null,
        e2e: null
      },
      completed: [],
      failed: [],
      blocked: [],
      needsClarification: [],
      lastUpdated: new Date().toISOString(),
      stats: this.calculateEmptyStats()
    };
  }

  /**
   * Add issue to appropriate queue
   */
  addToQueue(queuedIssue: QueuedIssue): boolean {
    // Check if already in queue
    if (this.findIssueInQueues(queuedIssue.id)) {
      return false; // Already queued
    }

    // Add to appropriate queue
    const queue = this.state.queues[queuedIssue.issueType];
    queue.push(queuedIssue);

    // Sort queue by priority and creation time
    this.sortQueue(queue);
    
    // Update stats and metadata
    this.updateState();
    
    return true;
  }

  /**
   * Remove issue from queue
   */
  removeFromQueue(issueId: string): QueuedIssue | null {
    for (const queueType of Object.keys(this.state.queues) as Array<keyof typeof this.state.queues>) {
      const queue = this.state.queues[queueType];
      const index = queue.findIndex(item => item.id === issueId);
      
      if (index >= 0) {
        const removed = queue.splice(index, 1)[0];
        this.updateState();
        return removed;
      }
    }
    return null;
  }

  /**
   * Get next issue to process from any queue (by priority)
   */
  getNextIssue(): QueuedIssue | null {
    // Collect all ready issues with their queue types
    const allReady: Array<QueuedIssue & { queueType: IssueType }> = [];
    
    for (const [queueType, queue] of Object.entries(this.state.queues)) {
      const readyIssues = queue
        .filter(issue => issue.isReady && !this.isCurrentlyProcessing(issue.id))
        .map(issue => ({ ...issue, queueType: queueType as IssueType }));
      
      allReady.push(...readyIssues);
    }

    if (allReady.length === 0) return null;

    // Sort by priority, then by queue time
    allReady.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      const aPriority = priorityOrder[a.priority];
      const bPriority = priorityOrder[b.priority];
      
      if (aPriority !== bPriority) {
        return bPriority - aPriority; // Higher priority first
      }
      
      // Same priority - older issues first
      return new Date(a.queuedAt).getTime() - new Date(b.queuedAt).getTime();
    });

    return allReady[0];
  }

  /**
   * Get next issue from specific queue type
   */
  getNextIssueFromQueue(queueType: IssueType): QueuedIssue | null {
    const queue = this.state.queues[queueType];
    const ready = queue.filter(issue => 
      issue.isReady && !this.isCurrentlyProcessing(issue.id)
    );

    return ready.length > 0 ? ready[0] : null;
  }

  /**
   * Mark issue as processing
   */
  startProcessing(issue: QueuedIssue): boolean {
    // Check if already processing
    if (this.isCurrentlyProcessing(issue.id)) {
      return false;
    }

    // Remove from queue
    const removed = this.removeFromQueue(issue.id);
    if (!removed) return false;

    // Add to processing
    this.state.currentProcessing[issue.issueType] = {
      issue,
      startedAt: new Date().toISOString(),
      modelUsed: issue.modelConfig.primaryModel
    };

    this.updateState();
    return true;
  }

  /**
   * Mark issue as completed
   */
  markCompleted(issueId: string, solution?: string): boolean {
    const processing = this.findProcessingItem(issueId);
    if (!processing) return false;

    const processingTime = Date.now() - new Date(processing.startedAt).getTime();

    const completed: CompletedItem = {
      issue: processing.issue,
      completedAt: new Date().toISOString(),
      processingTime,
      modelUsed: processing.modelUsed,
      solution,
      outputSize: solution?.length
    };

    // Add to completed
    this.state.completed.unshift(completed); // Most recent first

    // Remove from processing
    this.clearProcessing(processing.issue.issueType);
    
    // Limit completed history
    if (this.state.completed.length > 100) {
      this.state.completed = this.state.completed.slice(0, 100);
    }

    this.updateState();
    return true;
  }

  /**
   * Mark issue as failed
   */
  markFailed(issueId: string, error: string): boolean {
    const processing = this.findProcessingItem(issueId);
    if (!processing) return false;

    // Check if already failed before
    const existingFailed = this.state.failed.find(f => f.issue.id === issueId);
    const retryCount = existingFailed ? existingFailed.retryCount + 1 : 0;

    const failed: FailedItem = {
      issue: processing.issue,
      failedAt: new Date().toISOString(),
      error,
      retryCount,
      modelUsed: processing.modelUsed
    };

    // Remove existing failed entry if retrying
    if (existingFailed) {
      this.state.failed = this.state.failed.filter(f => f.issue.id !== issueId);
    }

    // Add to failed
    this.state.failed.unshift(failed); // Most recent first

    // Remove from processing
    this.clearProcessing(processing.issue.issueType);

    // Limit failed history
    if (this.state.failed.length > 50) {
      this.state.failed = this.state.failed.slice(0, 50);
    }

    this.updateState();
    return true;
  }

  /**
   * Retry failed issue
   */
  retryFailedIssue(issueId: string): boolean {
    const failed = this.state.failed.find(f => f.issue.id === issueId);
    if (!failed) return false;

    // Re-queue the issue
    const success = this.addToQueue(failed.issue);
    
    if (success) {
      // Keep failed record for history but mark as retried
      // Don't remove - let markCompleted or markFailed handle it
    }

    return success;
  }

  /**
   * Get current queue status
   */
  getQueueStatus(): QueueStatus {
    return this.state.stats;
  }

  /**
   * Get full queue state
   */
  getState(): QueueState {
    return { ...this.state };
  }

  /**
   * Get issues in specific queue
   */
  getQueue(queueType: IssueType): QueuedIssue[] {
    return [...this.state.queues[queueType]];
  }

  /**
   * Get all processing items
   */
  getCurrentProcessing(): Record<IssueType, ProcessingItem | null> {
    return { ...this.state.currentProcessing };
  }

  /**
   * Get completed items
   */
  getCompleted(): CompletedItem[] {
    return [...this.state.completed];
  }

  /**
   * Get failed items
   */
  getFailed(): FailedItem[] {
    return [...this.state.failed];
  }

  /**
   * Clear completed items
   */
  clearCompleted(): number {
    const count = this.state.completed.length;
    this.state.completed = [];
    this.updateState();
    return count;
  }

  /**
   * Update processing progress
   */
  updateProgress(issueId: string, progress: string): boolean {
    const processing = this.findProcessingItem(issueId);
    if (!processing) return false;

    processing.progress = progress;
    this.updateState();
    return true;
  }

  // Private helper methods

  private findIssueInQueues(issueId: string): QueuedIssue | null {
    for (const queue of Object.values(this.state.queues)) {
      const found = queue.find(item => item.id === issueId);
      if (found) return found;
    }
    return null;
  }

  private findProcessingItem(issueId: string): ProcessingItem | null {
    for (const processing of Object.values(this.state.currentProcessing)) {
      if (processing && processing.issue.id === issueId) {
        return processing;
      }
    }
    return null;
  }

  private isCurrentlyProcessing(issueId: string): boolean {
    return this.findProcessingItem(issueId) !== null;
  }

  private clearProcessing(queueType: IssueType): void {
    this.state.currentProcessing[queueType] = null;
  }

  private sortQueue(queue: QueuedIssue[]): void {
    queue.sort((a, b) => {
      // Priority order: high > medium > low
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      const aPriority = priorityOrder[a.priority];
      const bPriority = priorityOrder[b.priority];
      
      if (aPriority !== bPriority) {
        return bPriority - aPriority;
      }
      
      // Same priority - older issues first
      return new Date(a.queuedAt).getTime() - new Date(b.queuedAt).getTime();
    });
  }

  private calculateEmptyStats(): QueueStatus {
    return {
      feature: { total: 0, ready: 0, processing: 0, blocked: 0, completed: 0, failed: 0 },
      content: { total: 0, ready: 0, processing: 0, blocked: 0, completed: 0, failed: 0 },
      e2e: { total: 0, ready: 0, processing: 0, blocked: 0, completed: 0, failed: 0 },
      total: { total: 0, ready: 0, processing: 0, blocked: 0, completed: 0, failed: 0 }
    };
  }

  private calculateStats(): QueueStatus {
    const stats: QueueStatus = this.calculateEmptyStats();

    // Count queue items
    for (const [queueType, queue] of Object.entries(this.state.queues)) {
      const queueStats = stats[queueType as keyof Omit<QueueStatus, 'total'>] as QueueStats;
      
      queueStats.total = queue.length;
      queueStats.ready = queue.filter(item => item.isReady).length;
      queueStats.blocked = queue.filter(item => !item.isReady).length;
    }

    // Count processing items
    for (const [queueType, processing] of Object.entries(this.state.currentProcessing)) {
      if (processing) {
        const queueStats = stats[queueType as keyof Omit<QueueStatus, 'total'>] as QueueStats;
        queueStats.processing = 1;
      }
    }

    // Count completed items by original queue type
    for (const completed of this.state.completed) {
      const queueStats = stats[completed.issue.issueType] as QueueStats;
      queueStats.completed++;
    }

    // Count failed items by original queue type
    for (const failed of this.state.failed) {
      const queueStats = stats[failed.issue.issueType] as QueueStats;
      queueStats.failed++;
    }

    // Calculate totals
    const totalStats = stats.total;
    for (const queueStats of [stats.feature, stats.content, stats.e2e]) {
      totalStats.total += queueStats.total;
      totalStats.ready += queueStats.ready;
      totalStats.processing += queueStats.processing;
      totalStats.blocked += queueStats.blocked;
      totalStats.completed += queueStats.completed;
      totalStats.failed += queueStats.failed;
    }

    return stats;
  }

  private updateState(): void {
    this.state.lastUpdated = new Date().toISOString();
    this.state.stats = this.calculateStats();
  }
}

// Export singleton instance
export const queueManager = new QueueManager();