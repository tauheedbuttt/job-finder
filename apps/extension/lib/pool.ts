export function pool(size: number) {
  let busy = 0;
  const queue: Array<() => void> = [];
  return async <T,>(task: () => Promise<T>): Promise<T> => {
    if (busy >= size) await new Promise<void>((go) => queue.push(go));
    busy++;
    try {
      return await task();
    } finally {
      busy--;
      queue.shift()?.();
    }
  };
}
