export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startAutonomyWorker } = await import("./server/autonomy");
    startAutonomyWorker();
  }
}
