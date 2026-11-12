// フォルダ選択・ドラッグ＆ドロップから、エクスポート内の相対パス付きファイル一覧を作る。

export interface PickedFile {
  path: string;
  file: File;
}

// OS が作る不要ファイルや、Godot がエクスポート先に残す .import は送らない
function isIgnored(path: string): boolean {
  const name = path.slice(path.lastIndexOf('/') + 1);
  return name === '.DS_Store' || name === 'Thumbs.db' || name.endsWith('.import');
}

/**
 * 全ファイルが同じ最上位フォルダの下にあれば、その階層を取り除く。
 * （フォルダごと選ぶと "build/index.html" のようになるため）
 */
function stripCommonRoot(files: PickedFile[]): PickedFile[] {
  if (files.length === 0) return files;
  const firstSegment = files[0]!.path.split('/')[0];
  const allNested = files.every(
    (entry) => entry.path.includes('/') && entry.path.split('/')[0] === firstSegment,
  );
  if (!allNested) return files;
  return files.map((entry) => ({
    ...entry,
    path: entry.path.slice(entry.path.indexOf('/') + 1),
  }));
}

function finalize(files: PickedFile[]): PickedFile[] {
  return stripCommonRoot(files)
    .filter((entry) => !isIgnored(entry.path))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** <input type="file" webkitdirectory> から */
export function fromInput(list: FileList): PickedFile[] {
  return finalize(
    Array.from(list).map((file) => ({ path: file.webkitRelativePath || file.name, file })),
  );
}

function readEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}

async function walk(entry: FileSystemEntry, prefix: string, out: PickedFile[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject),
    );
    out.push({ path: prefix + entry.name, file });
    return;
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  // readEntries は一度に全件返さないことがあるので、空になるまで繰り返す
  for (;;) {
    const batch = await readEntries(reader);
    if (batch.length === 0) break;
    for (const child of batch) {
      await walk(child, `${prefix}${entry.name}/`, out);
    }
  }
}

/** ドラッグ＆ドロップから（フォルダも再帰的にたどる） */
export async function fromDrop(transfer: DataTransfer): Promise<PickedFile[]> {
  // エントリは同期的に取り出しておく（await を挟むと DataTransfer が無効になる）
  const entries = Array.from(transfer.items)
    .map((item) => item.webkitGetAsEntry())
    .filter((entry): entry is FileSystemEntry => entry !== null);
  const out: PickedFile[] = [];
  for (const entry of entries) {
    await walk(entry, '', out);
  }
  return finalize(out);
}

/** Godot の Web エクスポートとして足りないものを返す（サーバー側の検証と同じ基準）。 */
export function missingFiles(files: PickedFile[]): string[] {
  const paths = files.map((entry) => entry.path);
  const missing: string[] = [];
  if (!paths.includes('index.html')) missing.push('index.html');
  if (!paths.some((path) => path.endsWith('.wasm'))) missing.push('*.wasm');
  if (!paths.some((path) => path.endsWith('.pck'))) missing.push('*.pck');
  return missing;
}
