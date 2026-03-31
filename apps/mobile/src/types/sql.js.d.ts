declare module 'sql.js' {
  export interface Statement {
    bind(values?: (string | number | null | Uint8Array)[]): boolean;
    step(): boolean;
    getColumnNames(): string[];
    get(): unknown[];
    getAsObject(): Record<string, unknown>;
    free(): boolean;
    freemem(): void;
  }

  export class Database {
    constructor(data?: ArrayLike<number> | Buffer | null);
    run(sql: string, params?: (string | number | null | Uint8Array)[]): Database;
    exec(sql: string): Database;
    prepare(sql: string): Statement;
    close(): void;
    getRowsModified(): number;
  }

  export interface SqlJsStatic {
    Database: typeof Database;
  }

  export default function initSqlJs(config?: {
    locateFile?: (file: string) => string;
  }): Promise<SqlJsStatic>;
}

