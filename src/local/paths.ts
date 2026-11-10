import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
  type Stats,
} from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export function canonicalDirectory(path: string): string | null {
  try {
    const absolute = resolve(path);
    return lstatSync(absolute).isDirectory() ? realpathSync(absolute) : null;
  } catch {
    return null;
  }
}

// The root must be canonical. Reject symlinks anywhere between it and the target.
export function statWithin(root: string, target: string): Stats | null {
  if (target !== resolve(target)) return null;
  const child = relative(root, target);
  if (isAbsolute(child) || child === ".." || child.startsWith(`..${sep}`)) {
    return null;
  }

  try {
    let path = root;
    let stats = lstatSync(path);
    if (!stats.isDirectory() || realpathSync(root) !== root) return null;

    for (const part of child ? child.split(sep) : []) {
      if (!stats.isDirectory()) return null;
      path = join(path, part);
      stats = lstatSync(path);
      if (stats.isSymbolicLink()) return null;
    }

    return realpathSync(path) === path ? stats : null;
  } catch {
    return null;
  }
}

function sameFile(first: Stats, second: Stats): boolean {
  return first.dev === second.dev && first.ino === second.ino;
}

export function readRegularFile(
  root: string,
  path: string,
  maxBytes: number
): string | null {
  const before = statWithin(root, path);
  if (!before?.isFile() || before.nlink !== 1 || before.size > maxBytes) {
    return null;
  }

  let fd: number | undefined;
  try {
    fd = openSync(
      path,
      constants.O_RDONLY |
        (constants.O_NOFOLLOW ?? 0) |
        (constants.O_NONBLOCK ?? 0)
    );
    const opened = fstatSync(fd);
    const current = statWithin(root, path);
    if (
      !opened.isFile() ||
      opened.nlink !== 1 ||
      opened.size > maxBytes ||
      !sameFile(before, opened) ||
      !current ||
      !sameFile(current, opened)
    ) {
      return null;
    }

    const buffer = Buffer.alloc(opened.size + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const bytes = readSync(fd, buffer, offset, buffer.length - offset, null);
      if (bytes === 0) break;
      offset += bytes;
    }

    const after = fstatSync(fd);
    if (offset !== opened.size || after.ctimeMs !== opened.ctimeMs) return null;
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      buffer.subarray(0, offset)
    );
    return text.includes("\0") ? null : text;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
