/**
 * Label-Based Issue Routing System - Phase 1
 * Implements three-pillar AI queue routing (Feature, Content, E2E)
 */

export enum IssueType {
  FEATURE = 'feature',
  CONTENT = 'content',
  E2E = 'e2e'
}

export enum ComplexityLevel {
  SIMPLE = 'simple',
  MODERATE = 'moderate',
  COMPLEX = 'complex'
}

export enum PriorityLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high'
}

export interface ModelConfig {
  primaryModel: string;
  fallbackModel?: string;
  contextWindow: number;
  tools: string[];
  temperature: number;
  maxTokens?: number;
}

export interface GitHubIssue {
  id: string;
  number: number;
  title: string;
  body: string;
  labels: string[];
  repository: string;
  created_at: string;
  updated_at: string;
}

export interface QueuedIssue extends GitHubIssue {
  issueType: IssueType;
  complexity: ComplexityLevel;
  priority: PriorityLevel;
  modelConfig: ModelConfig;
  isReady: boolean;
  queuedAt: string;
}

// Label mapping for three-pillar system
const LABEL_MAPPING = {
  'ai-queue-feature': IssueType.FEATURE,
  'ai-queue-content': IssueType.CONTENT,
  'ai-queue-e2e': IssueType.E2E
} as const;

const COMPLEXITY_LABELS = {
  'complexity-simple': ComplexityLevel.SIMPLE,
  'complexity-moderate': ComplexityLevel.MODERATE,
  'complexity-complex': ComplexityLevel.COMPLEX
} as const;

const PRIORITY_LABELS = {
  'priority-low': PriorityLevel.LOW,
  'priority-medium': PriorityLevel.MEDIUM,
  'priority-high': PriorityLevel.HIGH
} as const;

// Pattern recognition for automatic type detection
const FEATURE_PATTERNS = [
  /\[FEATURE\]/i,
  /implement/i,
  /add.*functionality/i,
  /create.*api/i,
  /build.*component/i,
  /integrate.*with/i,
  /new.*feature/i,
  /enhancement/i
];

const CONTENT_PATTERNS = [
  /\[CONTENT\]/i,
  /documentation/i,
  /readme/i,
  /guide/i,
  /tutorial/i,
  /write.*docs/i,
  /update.*docs/i,
  /help.*text/i,
  /marketing/i
];

const E2E_PATTERNS = [
  /\[E2E\]/i,
  /test/i,
  /testing/i,
  /qa/i,
  /validation/i,
  /end.*to.*end/i,
  /e2e/i,
  /quality.*assurance/i
];

export class LabelRouter {
  /**
   * Detect issue type from labels, falling back to content analysis
   */
  detectIssueType(labels: string[]): IssueType | null {
    // Check explicit labels first
    for (const label of labels) {
      if (label in LABEL_MAPPING) {
        return LABEL_MAPPING[label as keyof typeof LABEL_MAPPING];
      }
    }
    
    return null; // No explicit type found
  }

  /**
   * Detect issue type from title and body content using pattern matching
   */
  detectIssueTypeFromContent(issue: GitHubIssue): IssueType | null {
    const text = `${issue.title} ${issue.body}`.toLowerCase();
    
    // Count pattern matches for each type
    const featureMatches = FEATURE_PATTERNS.filter(pattern => pattern.test(text)).length;
    const contentMatches = CONTENT_PATTERNS.filter(pattern => pattern.test(text)).length;
    const e2eMatches = E2E_PATTERNS.filter(pattern => pattern.test(text)).length;
    
    // Return type with most matches, or null if no clear winner
    const maxMatches = Math.max(featureMatches, contentMatches, e2eMatches);
    if (maxMatches === 0) return null;
    
    if (featureMatches === maxMatches) return IssueType.FEATURE;
    if (contentMatches === maxMatches) return IssueType.CONTENT;
    if (e2eMatches === maxMatches) return IssueType.E2E;
    
    return null;
  }

  /**
   * Determine complexity level from labels or content analysis
   */
  determineComplexity(labels: string[], issue?: GitHubIssue): ComplexityLevel {
    // Check explicit complexity labels first
    for (const label of labels) {
      if (label in COMPLEXITY_LABELS) {
        return COMPLEXITY_LABELS[label as keyof typeof COMPLEXITY_LABELS];
      }
    }
    
    // Fallback to content analysis if issue provided
    if (issue) {
      return this.assessComplexityFromContent(issue);
    }
    
    return ComplexityLevel.MODERATE; // Default
  }

  /**
   * Get priority level from labels
   */
  getPriority(labels: string[]): PriorityLevel {
    for (const label of labels) {
      if (label in PRIORITY_LABELS) {
        return PRIORITY_LABELS[label as keyof typeof PRIORITY_LABELS];
      }
    }
    
    return PriorityLevel.MEDIUM; // Default
  }

  /**
   * Check if issue is ready for processing
   */
  isReadyForProcessing(labels: string[]): boolean {
    return labels.includes('ai-queue-ready');
  }

  /**
   * Check if issue is blocked
   */
  isBlocked(labels: string[]): boolean {
    return labels.includes('blocked');
  }

  /**
   * Check if issue needs clarification
   */
  needsClarification(labels: string[]): boolean {
    return labels.includes('needs-clarification');
  }

  /**
   * Assess complexity from issue content using heuristics
   */
  private assessComplexityFromContent(issue: GitHubIssue): ComplexityLevel {
    let score = 0;
    const content = `${issue.title} ${issue.body}`.toLowerCase();

    // Length indicators
    if (issue.body.length > 2000) score += 2;
    else if (issue.body.length > 500) score += 1;

    // Technical complexity indicators
    if (/database|schema|migration/i.test(content)) score += 2;
    if (/api|integration|webhook/i.test(content)) score += 1;
    if (/multiple.*files?/i.test(content)) score += 1;
    if (/authentication|security|authorization/i.test(content)) score += 2;
    if (/performance|optimization|scaling/i.test(content)) score += 1;
    if (/refactor|architecture|redesign/i.test(content)) score += 2;

    // Business impact indicators
    if (/critical|urgent|blocking/i.test(issue.title)) score += 2;
    if (/architecture|system.*design/i.test(content)) score += 2;
    if (/breaking.*change/i.test(content)) score += 1;

    // UI/UX complexity
    if (/responsive|mobile|cross.*browser/i.test(content)) score += 1;
    if (/animation|transition|interactive/i.test(content)) score += 1;

    if (score >= 4) return ComplexityLevel.COMPLEX;
    if (score >= 2) return ComplexityLevel.MODERATE;
    return ComplexityLevel.SIMPLE;
  }

  /**
   * Suggest appropriate labels for an issue
   */
  suggestLabels(issue: GitHubIssue): string[] {
    const suggestions: string[] = [];

    // Suggest type label
    const detectedType = this.detectIssueTypeFromContent(issue);
    if (detectedType) {
      const typeLabel = Object.entries(LABEL_MAPPING)
        .find(([_, type]) => type === detectedType)?.[0];
      if (typeLabel) suggestions.push(typeLabel);
    }

    // Suggest complexity label
    const complexity = this.assessComplexityFromContent(issue);
    suggestions.push(`complexity-${complexity}`);

    // Suggest priority based on urgency keywords
    const content = `${issue.title} ${issue.body}`.toLowerCase();
    if (/critical|urgent|blocking|production/i.test(content)) {
      suggestions.push('priority-high');
    } else if (/important|needed|should/i.test(content)) {
      suggestions.push('priority-medium');
    } else {
      suggestions.push('priority-low');
    }

    return suggestions;
  }

  /**
   * Get model configuration for issue type and complexity
   */
  getModelConfig(type: IssueType, complexity: ComplexityLevel): ModelConfig {
    const baseConfigs: Record<IssueType, ModelConfig> = {
      [IssueType.FEATURE]: {
        primaryModel: 'qwen2.5-coder:32b',
        fallbackModel: 'llama-3.3-70b-instruct',
        contextWindow: 32768,
        tools: ['aider', 'continue'],
        temperature: 0.1,
        maxTokens: 4096
      },
      [IssueType.CONTENT]: {
        primaryModel: 'qwen2.5-coder:32b',
        fallbackModel: 'llama-3.3-70b-instruct',
        contextWindow: 16384,
        tools: ['continue', 'repository-context'],
        temperature: 0.15,
        maxTokens: 4096
      },
      [IssueType.E2E]: {
        primaryModel: 'qwen2.5-coder:32b',
        contextWindow: 32768,
        tools: ['aider', 'continue', 'test-generation'],
        temperature: 0.05, // Lower for deterministic tests
        maxTokens: 4096
      }
    };

    const config = { ...baseConfigs[type] };

    // Adjust based on complexity
    if (complexity === ComplexityLevel.COMPLEX) {
      config.maxTokens = Math.min(config.contextWindow, 8192);
    } else if (complexity === ComplexityLevel.SIMPLE) {
      config.maxTokens = Math.min(config.contextWindow, 2048);
    } else {
      config.maxTokens = Math.min(config.contextWindow, 4096);
    }

    return config;
  }

  /**
   * Validate issue has proper labeling
   */
  validateIssueLabels(labels: string[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for primary type label
    const hasTypeLabel = labels.some(label => label in LABEL_MAPPING);
    if (!hasTypeLabel) {
      errors.push('Missing primary type label (ai-queue-feature, ai-queue-content, or ai-queue-e2e)');
    }

    // Check for ready state if type is present
    const hasReadyLabel = labels.includes('ai-queue-ready');
    if (hasTypeLabel && !hasReadyLabel) {
      errors.push('ai-queue-ready label required when issue has type label');
    }

    // Check for conflicting states
    const isBlocked = labels.includes('blocked');
    const needsClarification = labels.includes('needs-clarification');
    if (hasReadyLabel && (isBlocked || needsClarification)) {
      errors.push('Issue cannot be ready if blocked or needs clarification');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Process issue through complete routing pipeline
   */
  routeIssue(issue: GitHubIssue): QueuedIssue | null {
    // Detect or extract issue type
    let issueType = this.detectIssueType(issue.labels);
    if (!issueType) {
      issueType = this.detectIssueTypeFromContent(issue);
    }

    // Skip if no type can be determined
    if (!issueType) {
      return null;
    }

    // Skip if not ready or blocked
    if (!this.isReadyForProcessing(issue.labels) || this.isBlocked(issue.labels)) {
      return null;
    }

    const complexity = this.determineComplexity(issue.labels, issue);
    const priority = this.getPriority(issue.labels);
    const modelConfig = this.getModelConfig(issueType, complexity);

    return {
      ...issue,
      issueType,
      complexity,
      priority,
      modelConfig,
      isReady: true,
      queuedAt: new Date().toISOString()
    };
  }
}

// Export singleton instance
export const labelRouter = new LabelRouter();