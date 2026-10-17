export async function readStateOrInitialize(read, write, createInitial) {
  try {
    return await read();
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    const initial = createInitial();
    try {
      await write(initial);
      return initial;
    } catch (writeError) {
      // Another API/worker process may have initialized the file after our
      // missing-file read. Prefer that committed state over replacing it.
      try { return await read(); }
      catch { throw writeError; }
    }
  }
}
