import { BacklogService } from '../../services/backlog.js';

export interface InitOptions {
  force?: boolean;
  id?: string;
  json?: boolean;
}

export async function initBacklog(path: string, options: InitOptions) {
  const service = new BacklogService();
  return service.init(path, {
    force: options.force,
    backlogId: options.id,
  });
}
