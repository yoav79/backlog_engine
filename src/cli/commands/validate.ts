import { readFile } from 'node:fs/promises';
import { parse } from '../../parser/index.js';
import { validateStructure, validateSemantics } from '../../validator/index.js';

export interface ValidateOptions {
  json?: boolean;
}

export async function validateBacklog(path: string, _options: ValidateOptions) {
  const content = await readFile(path, 'utf-8');
  let doc;
  try {
    doc = parse(content);
  } catch (err: any) {
    return {
      valid: false,
      errors: [
        {
          code: err.code ?? 'PARSE_ERROR',
          message: err.message,
          path: path,
          itemId: undefined,
        },
      ],
    };
  }
  const structural = validateStructure(doc);
  if (!structural.valid) {
    return structural;
  }
  const semantic = validateSemantics(doc);
  return semantic;
}
