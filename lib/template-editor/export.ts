/** Export rendered frames; loading errors are surfaced instead of producing empty artwork. */
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export const fileName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "design";

export async function exportFrames(
  frames: HTMLElement[],
  name: string,
  caption: string,
  progress: (value: number) => void,
) {
  if (!frames.length) throw new Error("No pages to export.");
  await document.fonts.ready;
  const { domToBlob } = await import("modern-screenshot");
  const outputs: Blob[] = [];
  for (let i = 0; i < frames.length; i++) {
    for (const img of Array.from(frames[i].querySelectorAll("img"))) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          img.decode(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  new Error("An image did not load. Replace it and try again."),
                ),
              15_000,
            );
          }),
        ]);
      } catch {
        throw new Error(
          `Page ${i + 1} has an image that could not load. Replace it and try again.`,
        );
      } finally {
        clearTimeout(timer);
      }
    }
    const blob = await domToBlob(frames[i], {
      scale: 3,
      type: "image/png",
      backgroundColor: "#0c0c0c",
    });
    if (!blob?.size) throw new Error(`Could not export page ${i + 1}.`);
    outputs.push(blob);
    progress(Math.round(((i + 1) / frames.length) * 100));
  }
  const base = fileName(name);
  if (outputs.length === 1) saveBlob(outputs[0], `${base}.png`);
  else {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    outputs.forEach((blob, i) =>
      zip.file(`${String(i + 1).padStart(2, "0")}-${base}.png`, blob),
    );
    if (caption.trim()) zip.file("caption.txt", caption.trim());
    saveBlob(await zip.generateAsync({ type: "blob" }), `${base}.zip`);
  }
}
