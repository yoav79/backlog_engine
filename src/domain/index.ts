export type BacklogStatus =
  | 'todo'
  | 'ready'
  | 'in_progress'
  | 'blocked'
  | 'done'
  | 'cancelled';

export type Priority = 'critical' | 'high' | 'medium' | 'low';

export type ItemType = 'feature' | 'bug' | 'improvement' | 'documentation';

export interface AcceptanceCriterion {
  text: string;
  completed: boolean;
}

export interface BacklogItem {
  id: string;
  title: string;
  status: BacklogStatus;
  priority: Priority;
  type: ItemType;
  owner: string;
  dependsOn: string[];
  scope: string;
  createdAt: string;
  updatedAt: string;
  description: string;
  acceptanceCriteria: AcceptanceCriterion[];
  evidence: string[];
  notes: string[];
}

export interface BacklogDocument {
  schemaVersion: 1;
  backlogId: string;
  updatedAt: string;
  items: BacklogItem[];
}

export type ChangeOperation =
  | 'create'
  | 'update'
  | 'status_transition'
  | 'delete'
  | 'restore'
  | 'bulk_update';

export interface FieldChange {
  field: string;
  previousValue: unknown;
  currentValue: unknown;
}

export interface BacklogChange {
  changeId: string;
  timestamp: string;
  actor: string;
  operation: ChangeOperation;
  itemIds: string[];
  reason?: string;
  changes: FieldChange[];
  commandId: string;
}

export interface ChangelogDocument {
  schemaVersion: 1;
  changelogId: string;
  lastChangeId: string;
  updatedAt: string;
  entries: BacklogChange[];
}

export interface CreateBacklogItemInput {
  title: string;
  type: ItemType;
  priority: Priority;
  scope: string;
  owner?: string;
  description?: string;
}

export interface UpdateBacklogItemInput {
  title?: string;
  status?: BacklogStatus;
  priority?: Priority;
  type?: ItemType;
  owner?: string;
  dependsOn?: string[];
  scope?: string;
  description?: string;
  acceptanceCriteria?: AcceptanceCriterion[];
  evidence?: string[];
  notes?: string[];
}

export interface SelectionRequest {
  requestedIds: string[];
  excludeStatuses?: BacklogStatus[];
  dependencyPolicy?: 'strict' | 'normal';
}

export interface ExcludedItem {
  id: string;
  reason: string;
}

export interface SelectionResult {
  requestedIds: string[];
  selectedIds: string[];
  excludedItems: ExcludedItem[];
  dependencyPolicy: string;
}

export interface ValidationError {
  code: string;
  message: string;
  path?: string;
  itemId?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface QueryResult {
  found: BacklogItem[];
  notFound: { id: string; reason: string }[];
  totalFound: number;
}

export interface MutationResult {
  id: string;
  status: string;
  applied: boolean;
}

export interface PromptResult {
  promptPath: string;
  manifestPath?: string;
  selectedCount: number;
  excludedCount: number;
}

export interface HistoryEntry {
  changeId: string;
  operation: ChangeOperation;
  actor: string;
  timestamp: string;
  changes: FieldChange[];
  commandId: string;
}

export interface HistoryResult {
  entries: HistoryEntry[];
  total: number;
}

export interface InitInput {
  backlogId?: string;
}

export interface BacklogTransactionResult {
  backlogMarkdown: string;
  changelogMarkdown: string;
  change: BacklogChange | null;
  applied: boolean;
}

export interface BacklogEngine {
  validate(markdown: string): ValidationResult;
  init(input: InitInput): BacklogTransactionResult;
  add(
    markdown: string,
    changelog: string,
    input: CreateBacklogItemInput,
  ): BacklogTransactionResult;
  update(
    markdown: string,
    changelog: string,
    id: string,
    patch: UpdateBacklogItemInput,
  ): BacklogTransactionResult;
  close(
    markdown: string,
    changelog: string,
    id: string,
    evidence: string[],
    actor: string,
    commandId: string,
  ): BacklogTransactionResult;
  get(markdown: string, ids: string[]): QueryResult;
  list(markdown: string, filter?: ListFilter): QueryResult;
  select(markdown: string, request: SelectionRequest): SelectionResult;
  generatePrompt(markdown: string, request: PromptRequest): PromptResult;
  getHistory(changelog: string, itemId: string): HistoryResult;
  queryChanges(changelog: string, filter: ChangeFilter): ChangeQueryResult;
  diff(
    changelog: string,
    itemId: string,
    fromChangeId: string,
    toChangeId: string,
  ): DiffResult;
  validateChangelog(changelog: string): ValidationResult;
  render(document: BacklogDocument): string;
}

export interface ListFilter {
  status?: BacklogStatus;
}

export interface PromptRequest {
  ids: string[];
  outputPath: string;
}

export interface ChangeFilter {
  actor?: string;
  operation?: ChangeOperation;
  since?: string;
  limit?: number;
}

export interface ChangeQueryResult {
  entries: HistoryEntry[];
  total: number;
}

export interface DiffResult {
  itemId: string;
  fromChangeId: string;
  toChangeId: string;
  changes: FieldChange[];
}

export const BACKLOG_STATUSES: BacklogStatus[] = [
  'todo',
  'ready',
  'in_progress',
  'blocked',
  'done',
  'cancelled',
];

export const PRIORITIES: Priority[] = ['critical', 'high', 'medium', 'low'];

export const ITEM_TYPES: ItemType[] = [
  'feature',
  'bug',
  'improvement',
  'documentation',
];

export const CHANGE_OPERATIONS: ChangeOperation[] = [
  'create',
  'update',
  'status_transition',
  'delete',
  'restore',
  'bulk_update',
];
